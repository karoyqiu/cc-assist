use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;
use std::sync::Arc;

use time::OffsetDateTime;

use cc_sdk::{ClaudeSDKClient, PermissionMode as SdkPermissionMode};
use serde::{Deserialize, Serialize};

use crate::permission_allowlist::PermissionAllowlist;
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
    #[serde(rename = "auto_accept_edits")]
    AcceptEdits,
    #[serde(rename = "plan_mode")]
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
    pub client: Arc<tokio::sync::Mutex<ClaudeSDKClient>>,
    pub permission_mode: PermissionMode,
    pub state: SessionState,
    pub cwd: PathBuf,
    pub session_name: String,
    pub profile_id: String,
    pub last_used_at: OffsetDateTime,
    pub message_count: u32,
}

/// Manager for all active chat sessions.
pub struct ChatSessionManager {
    pub sessions: Mutex<HashMap<String, ChatSession>>,
}

/// AppState — shared across all Tauri commands.
pub struct AppState {
    pub store: Mutex<ProfilesStore>,
    pub app_data_dir: Mutex<PathBuf>,
    pub sessions: Mutex<HashMap<String, SessionHandle>>,
    pub chat_sessions: ChatSessionManager,
    pub allowlist: Mutex<PermissionAllowlist>,
}
