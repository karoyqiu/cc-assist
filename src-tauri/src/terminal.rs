//! PTY session management using two threads per session:
//! - Reader thread: reads PTY output into a shared buffer (polled by frontend)
//! - Command thread: handles Write / Resize / Close via mpsc channel

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::settings;
use crate::state::{AppState, PtyCommand, SessionHandle};
use crate::types::ProfileConfig;

/// Result returned after creating a session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResult {
    pub session_id: String,
    pub name: String,
}

/// Info about an active session (returned by list command).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
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

    // Build temp settings file
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
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Spawn claude in the PTY slave
    let mut cmd = CommandBuilder::new("claude");
    cmd.args(["--settings", &temp_path_buf.to_string_lossy()]);
    cmd.cwd(&dir);

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let master = pair.master;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = master.take_writer().map_err(|e| e.to_string())?;

    // Shared output buffer
    let output: Arc<std::sync::Mutex<VecDeque<String>>> =
        Arc::new(std::sync::Mutex::new(VecDeque::<String>::new()));
    let output_reader = output.clone();

    // Command channel
    let (cmd_tx, cmd_rx) = mpsc::channel::<PtyCommand>();
    let temp_path_cmd = temp_path_buf.clone();

    // Command thread — handles Write, Resize, Close
    thread::spawn(move || {
        loop {
            match cmd_rx.recv() {
                Ok(PtyCommand::Write(data)) => {
                    let _ = writer.write_all(data.as_bytes());
                }
                Ok(PtyCommand::Resize(cols, rows)) => {
                    let _ = master.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
                Ok(PtyCommand::Close) | Err(_) => {
                    let _ = child.kill();
                    let _ = std::fs::remove_file(&temp_path_cmd);
                    return;
                }
            }
        }
    });

    let temp_path_reader = temp_path_buf;

    // Reader thread — reads PTY output into shared buffer
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    if let Ok(mut out) = output_reader.lock() {
                        out.push_back(data);
                    }
                }
                Err(_) => {
                    thread::sleep(std::time::Duration::from_millis(5));
                }
            }
        }
        let _ = std::fs::remove_file(&temp_path_reader);
    });

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

    // Register session
    let state = app.state::<AppState>();
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.insert(
        session_id.clone(),
        SessionHandle {
            name: name.clone(),
            cmd_sender: cmd_tx,
            output,
        },
    );

    Ok(CreateSessionResult { session_id, name })
}

/// List all active terminal sessions.
pub fn list_sessions(state: &AppState) -> Vec<(String, String)> {
    let sessions = state.sessions.lock().unwrap();
    sessions
        .iter()
        .map(|(id, handle)| (id.clone(), handle.name.clone()))
        .collect()
}

/// Drain buffered PTY output for a session (polled by frontend).
pub fn read_output(session_id: &str, state: &AppState) -> Result<String, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let handle = sessions
        .get(session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;
    let mut buf = handle.output.lock().map_err(|e| e.to_string())?;
    let data: String = buf.drain(..).collect();
    Ok(data)
}

/// Write data to a PTY session (via command thread).
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

/// Resize a PTY session (via command thread).
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
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .remove(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?
    };
    let _ = handle.cmd_sender.send(PtyCommand::Close);
    Ok(())
}

/// Remove stale temp settings files older than 60 seconds.
pub fn cleanup_stale_temp_files() {
    let temp_dir = std::env::temp_dir();
    let Ok(entries) = std::fs::read_dir(&temp_dir) else {
        return;
    };
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(60);
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
