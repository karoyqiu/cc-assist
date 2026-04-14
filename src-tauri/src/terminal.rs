//! PTY session management using background threads + channels.
//! Each session runs in its own std::thread, communicating via mpsc.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::settings;
use crate::state::{AppState, PtyCommand, SessionHandle};
use crate::types::ProfileConfig;

/// Packet sent from PTY worker to frontend via Tauri event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalPacket {
    pub session_id: String,
    pub data: String,
}

/// Result returned after creating a session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResult {
    pub session_id: String,
    pub name: String,
}

/// Create a new PTY session for a profile + directory.
pub fn create_session(
    profile: &ProfileConfig,
    directory: &PathBuf,
    app: AppHandle,
) -> Result<CreateSessionResult, String> {
    let session_id = Uuid::new_v4().to_string();
    let profile_name = profile.name.clone();
    let dir = directory.clone();

    // Build temp settings file (same approach as spawn.rs)
    cleanup_stale_temp_files();

    let mut settings_json =
        settings::read_settings_json_or_empty().map_err(|e| e.to_string())?;
    settings::clear_profile_env_keys(&mut settings_json);
    settings::merge_profile_into_settings(profile, &mut settings_json);

    let temp_dir = std::env::temp_dir();
    let mut temp_file =
        tempfile::NamedTempFile::with_prefix_in("cc-assist-settings-", &temp_dir)
            .map_err(|e| e.to_string())?;
    let settings_str =
        serde_json::to_string_pretty(&settings_json).map_err(|e| e.to_string())?;
    temp_file
        .write_all(settings_str.as_bytes())
        .map_err(|e| e.to_string())?;
    temp_file.flush().map_err(|e| e.to_string())?;
    let temp_path = temp_file.into_temp_path();
    let temp_path_buf = temp_path.to_path_buf();
    temp_path.keep().map_err(|e| e.to_string())?;

    // Create PTY pair
    log::info!("Creating PTY pair...");
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| {
            log::error!("openpty failed: {}", e);
            e.to_string()
        })?;
    log::info!("PTY pair created successfully");

    // Spawn claude in the PTY slave
    let mut cmd = CommandBuilder::new("claude");
    cmd.args(["--settings", &temp_path_buf.to_string_lossy()]);
    cmd.cwd(&dir);

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        log::error!("spawn_command failed: {}", e);
        e.to_string()
    })?;
    log::info!("claude spawned successfully");
    drop(pair.slave);

    let master = pair.master;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = master.take_writer().map_err(|e| e.to_string())?;

    let (cmd_tx, cmd_rx) = mpsc::channel::<PtyCommand>();
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    let temp_path_clone = temp_path_buf.clone();
    let mut child = child;
    let master = master;

    // Spawn worker thread
    log::info!("About to spawn worker thread...");
    thread::spawn(move || {
        let cmd_rx = cmd_rx;
        let mut buf = [0u8; 4096];
        log::info!("Worker thread started for session {}", session_id_clone);

        loop {
            // Check for commands first (non-blocking)
            while let Ok(cmd) = cmd_rx.try_recv() {
                match cmd {
                    PtyCommand::Write(data) => {
                        log::info!("Write command received, {} bytes", data.len());
                        let _ = writer.write_all(data.as_bytes());
                    }
                    PtyCommand::Resize(cols, rows) => {
                        log::info!("Resize command: {}x{}", cols, rows);
                        let _ = master.resize(PtySize {
                            rows,
                            cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                    PtyCommand::Close => {
                        log::info!("Close command received");
                        let _ = child.kill();
                        drop(writer);
                        drop(reader);
                        let _ = std::fs::remove_file(&temp_path_clone);
                        return;
                    }
                }
            }

            // Read from PTY reader (with timeout to allow command checking)
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — PTY closed
                    log::info!("PTY EOF, worker thread exiting");
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    log::info!("PTY read {} bytes: {:?}", n, &data[..data.len().min(100)]);
                    let packet = TerminalPacket {
                        session_id: session_id_clone.clone(),
                        data,
                    };
                    if app_clone.emit("terminal-output", packet).is_err() {
                        log::info!("Emit failed, worker thread exiting");
                        break;
                    }
                }
                Err(_) => {
                    // Would-block or other error — continue loop
                    thread::sleep(std::time::Duration::from_millis(10));
                }
            }
        }

        // Clean up
        drop(child);
        drop(writer);
        drop(reader);
        let _ = std::fs::remove_file(&temp_path_clone);
    });

    // Register session in AppState
    let state = app.state::<AppState>();
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.insert(
        session_id.clone(),
        SessionHandle {
            cmd_sender: cmd_tx,
        },
    );
    log::info!("Session registered: {}", session_id);

    // Session name
    let name = if dir.file_name().is_some() {
        format!(
            "{} ({})",
            dir.file_name().unwrap().to_string_lossy(),
            profile_name
        )
    } else {
        format!("{} ({})", dir.display(), profile_name)
    };

    Ok(CreateSessionResult { session_id, name })
}

/// Write data to a PTY session.
pub fn write_to_session(session_id: &str, data: &str, state: &AppState) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let handle = sessions
        .get(session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    handle
        .cmd_sender
        .send(PtyCommand::Write(data.to_string()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resize a PTY session.
pub fn resize_session(
    session_id: &str,
    cols: u16,
    rows: u16,
    state: &AppState,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let handle = sessions
        .get(session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    handle
        .cmd_sender
        .send(PtyCommand::Resize(cols, rows))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Close and remove a PTY session.
pub fn close_session(session_id: &str, state: &AppState) -> Result<(), String> {
    let handle = {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| format!("Session not found: {}", session_id))?
    };

    // Signal Close to worker thread (it will kill PTY and exit)
    let _ = handle.cmd_sender.send(PtyCommand::Close);

    // Remove from sessions map immediately
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.remove(session_id);

    Ok(())
}

/// Remove stale temp settings files older than 60 seconds.
pub fn cleanup_stale_temp_files() {
    let temp_dir = std::env::temp_dir();
    let Ok(entries) = std::fs::read_dir(&temp_dir) else {
        return;
    };
    let cutoff = std::time::SystemTime::now()
        - std::time::Duration::from_secs(60);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with("cc-assist-settings-") && name_str.ends_with(".json") {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if modified < cutoff {
                        std::fs::remove_file(entry.path()).ok();
                    }
                }
            }
        }
    }
}
