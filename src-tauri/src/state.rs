use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex as StdMutex};

use tokio::sync::Mutex as TokioMutex;

use cc_sdk::{ClaudeSDKClient, PermissionMode as SdkPermissionMode};
use serde::{Deserialize, Serialize};

use crate::permission_allowlist::Allowlist;
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
    pub cwd: PathBuf,
    pub cmd_sender: mpsc::Sender<PtyCommand>,
}

/// Permission mode for chat sessions — maps to cc-sdk's PermissionMode.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    Default,
    AcceptEdits,
    Plan,
}

impl From<PermissionMode> for SdkPermissionMode {
    fn from(mode: PermissionMode) -> Self {
        match mode {
            PermissionMode::Default => SdkPermissionMode::Default,
            PermissionMode::AcceptEdits => SdkPermissionMode::AcceptEdits,
            PermissionMode::Plan => SdkPermissionMode::Plan,
        }
    }
}

/// Session state for UI display.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Idle,
    Thinking,
    RequestInput,
    RequestPermission,
    Error,
}

/// A chat session backed by a cc-sdk client.
pub struct ChatSession {
    pub client: Arc<TokioMutex<ClaudeSDKClient>>,
    pub permission_mode: PermissionMode,
    pub state: SessionState,
    pub cwd: PathBuf,
    pub session_name: String,
    pub profile_id: String,
}

/// Manager for all active chat sessions.
pub struct ChatSessionManager {
    pub sessions: StdMutex<HashMap<String, ChatSession>>,
}

/// AppState — shared across all Tauri commands.
pub struct AppState {
    pub store: StdMutex<ProfilesStore>,
    pub app_data_dir: StdMutex<PathBuf>,
    pub sessions: StdMutex<HashMap<String, SessionHandle>>,
    pub chat_sessions: ChatSessionManager,
    pub app_handle: StdMutex<Option<tauri::AppHandle>>,
    pub allowlist: StdMutex<Allowlist>,
    pub allowlist_path: StdMutex<PathBuf>,
}
