use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};

use crate::types::ProfilesStore;

/// Messages sent to a PTY session worker thread.
#[derive(Debug)]
pub enum PtyCommand {
    Write(String),
    Resize(u16, u16),
    Close,
}

/// A running PTY session: just a command sender.
/// The worker thread is self-managing; we signal Close and it exits.
#[derive(Clone)]
pub struct SessionHandle {
    pub cmd_sender: mpsc::Sender<PtyCommand>,
}

/// AppState — shared across all Tauri commands.
pub struct AppState {
    pub store: Mutex<ProfilesStore>,
    pub app_data_dir: Mutex<PathBuf>,
    pub sessions: Mutex<HashMap<String, SessionHandle>>,
}
