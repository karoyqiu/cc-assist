use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;

use crate::types::ProfilesStore;

/// Messages sent to the command thread.
#[derive(Debug)]
pub enum PtyCommand {
    Write(String),
    Resize(u16, u16),
    Close,
}

/// A running PTY session.
/// `cmd_sender` sends commands to a dedicated command thread.
#[derive(Clone)]
pub struct SessionHandle {
    pub name: String,
    pub cmd_sender: mpsc::Sender<PtyCommand>,
}

/// AppState — shared across all Tauri commands.
pub struct AppState {
    pub store: Mutex<ProfilesStore>,
    pub app_data_dir: Mutex<PathBuf>,
    pub sessions: Mutex<HashMap<String, SessionHandle>>,
}
