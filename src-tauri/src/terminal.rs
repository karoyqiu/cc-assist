//! PTY session management using two threads per session:
//! - Reader thread: reads PTY output and emits Tauri events
//! - Command thread: handles Write / Resize / Close via mpsc channel,
//!   detects child process exit via try_wait()

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

/// Result returned after creating a session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResult {
    pub session_id: String,
    pub name: String,
    pub cwd: PathBuf,
}

/// Info about an active session (returned by list command).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub name: String,
    pub cwd: PathBuf,
}

/// Payload emitted with `terminal-output` events.
#[derive(Debug, Clone, Serialize)]
pub struct OutputEvent {
    pub session_id: String,
    pub data: String,
}

/// Payload emitted when a session exits.
#[derive(Debug, Clone, Serialize)]
pub struct SessionExitedEvent {
    pub session_id: String,
    pub cwd: PathBuf,
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

    // Build temp settings file with all profile env vars (empty if unset)
    cleanup_stale_temp_files();

    let env_map = settings::build_full_env_map(profile);
    let mut env = serde_json::Map::new();
    for (key, value) in env_map {
        env.insert(key, serde_json::Value::String(value));
    }
    let settings_json = serde_json::json!({ "env": serde_json::Value::Object(env) });

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

    // Command channel
    let (cmd_tx, cmd_rx) = mpsc::channel::<PtyCommand>();
    let temp_path_cmd = temp_path_buf.clone();
    let sid_for_cmd = session_id.clone();
    let app_for_cmd = app.clone();
    let cwd_for_cmd = dir.clone();

    // Command thread — handles Write, Resize, Close, and detects child exit
    thread::spawn(move || {
        loop {
            match cmd_rx.recv_timeout(std::time::Duration::from_secs(1)) {
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
                Ok(PtyCommand::Close) => {
                    let _ = child.kill();
                    let _ = std::fs::remove_file(&temp_path_cmd);
                    return;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    match child.try_wait() {
                        Ok(Some(_)) => {
                            let _ = std::fs::remove_file(&temp_path_cmd);
                            let event = SessionExitedEvent { session_id: sid_for_cmd.clone(), cwd: cwd_for_cmd.clone() };
                            let _ = app_for_cmd.emit("session-exited", &event);
                            return;
                        }
                        Ok(None) => {}
                        Err(_) => {
                            let _ = std::fs::remove_file(&temp_path_cmd);
                            let event = SessionExitedEvent { session_id: sid_for_cmd.clone(), cwd: cwd_for_cmd.clone() };
                            let _ = app_for_cmd.emit("session-exited", &event);
                            return;
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    let _ = child.kill();
                    let _ = std::fs::remove_file(&temp_path_cmd);
                    return;
                }
            }
        }
    });

    let sid_for_reader = session_id.clone();
    let app_for_reader = app.clone();

    // Reader thread — reads PTY output and emits Tauri events
    // Stops when the pipe closes (command thread drops writer on exit)
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let event = OutputEvent {
                        session_id: sid_for_reader.clone(),
                        data,
                    };
                    let _ = app_for_reader.emit("terminal-output", &event);
                }
                Err(_) => break,
            }
        }
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
            cwd: dir.clone(),
            cmd_sender: cmd_tx,
        },
    );

    Ok(CreateSessionResult { session_id, name, cwd: dir.clone() })
}

/// List all active terminal sessions.
pub fn list_sessions(state: &AppState) -> Vec<(String, String, PathBuf)> {
    let sessions = state.sessions.lock().unwrap();
    sessions
        .iter()
        .map(|(id, handle)| (id.clone(), handle.name.clone(), handle.cwd.clone()))
        .collect()
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
