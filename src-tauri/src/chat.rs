use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use time::OffsetDateTime;
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;

fn find_claude_exe() -> Result<PathBuf, String> {
    for name in &["claude", "claude-code"] {
        if let Ok(path) = which::which(name) {
            return Ok(path);
        }
    }
    Err("claude not found in PATH. Install Claude Code CLI: npm install -g @anthropic-ai/claude-code".to_string())
}

use cc_sdk::{ClaudeCodeOptions, ClaudeSDKClient};

use crate::settings;
use crate::state::{AppState, ChatSession, PermissionMode, SessionState};

/// Full info about a chat session, returned by list_sessions.
#[derive(serde::Serialize)]
pub struct ChatSessionInfo {
    pub session_id: String,
    pub name: String,
    pub state: SessionState,
    pub cwd: PathBuf,
}

/// Result of creating a new chat session.
#[derive(serde::Serialize)]
pub struct CreateChatSessionResult {
    pub session_id: String,
    pub name: String,
    pub cwd: PathBuf,
}

/// Lightweight info about a recent session.
#[derive(serde::Serialize, Clone)]
pub struct RecentSessionInfo {
    pub session_id: String,
    pub name: String,
    pub cwd: PathBuf,
    pub last_active: OffsetDateTime,
    pub profile_id: String,
    pub profile_name: String,
}

/// Creates a new chat session for the given profile and working directory.
pub async fn create_chat_session(
    profile_id: &str,
    directory: PathBuf,
    app: AppHandle,
) -> Result<CreateChatSessionResult, String> {
    // Get the profile config
    let state = app.state::<AppState>();
    let store = state
        .store
        .lock()
        .map_err(|e| format!("failed to lock store: {}", e))?;

    let profile = store
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("profile not found: {}", profile_id))?
        .clone();

    drop(store);

    // Read base env from ~/.claude/settings.json, then merge profile vars on top
    let base_env: HashMap<String, String> = settings::read_settings_json_or_empty()
        .ok()
        .and_then(|v| v.get("env")?.as_object().cloned())
        .map(|obj| {
            obj.into_iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
                .collect()
        })
        .unwrap_or_default();

    // Build full env map from profile, with profile vars overriding base
    let profile_env: HashMap<String, String> = settings::build_env_map(&profile)
        .into_iter()
        .collect();

    let mut merged_env = base_env;
    for (k, v) in profile_env {
        if !v.is_empty() {
            merged_env.insert(k, v);
        }
    }

    // Verify claude CLI is available
    let _ = find_claude_exe()?;

    // Build ClaudeCodeOptions with merged env vars and project settings
    let options = ClaudeCodeOptions {
        env: merged_env,
        setting_sources: Some(vec![cc_sdk::SettingSource::Project]),
        cwd: Some(directory.clone()),
        ..Default::default()
    };

    // Create the cc-sdk client
    let client = ClaudeSDKClient::new(options);

    // Generate session name and ID
    let session_id = Uuid::new_v4().to_string();
    let name = format!("session-{}", &session_id[..8]);

    // Store the session
    let session = ChatSession {
        client: Arc::new(TokioMutex::new(client)),
        permission_mode: PermissionMode::Default,
        state: SessionState::Idle,
        cwd: directory.clone(),
        session_name: name.clone(),
        profile_id: profile_id.to_string(),
    };

    state
        .chat_sessions
        .sessions
        .lock()
        .map_err(|e| format!("failed to lock chat sessions: {}", e))?
        .insert(session_id.clone(), session);

    // Emit idle state after creation
    let _ = app.emit(
        "session-state",
        serde_json::json!({
            "session_id": session_id,
            "state": "idle"
        }),
    );

    Ok(CreateChatSessionResult {
        session_id,
        name,
        cwd: directory,
    })
}

/// Closes and removes a chat session.
pub async fn close_chat_session(
    session_id: &str,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut sessions = state
        .chat_sessions
        .sessions
        .lock()
        .map_err(|e| format!("failed to lock chat sessions: {}", e))?;

    sessions
        .remove(session_id)
        .ok_or_else(|| format!("session not found: {}", session_id))?;

    Ok(())
}

/// Updates the permission mode for an existing session.
#[allow(dead_code)]
pub async fn set_permission_mode(
    session_id: &str,
    mode: PermissionMode,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut sessions = state
        .chat_sessions
        .sessions
        .lock()
        .map_err(|e| format!("failed to lock chat sessions: {}", e))?;

    let session = sessions
        .get_mut(session_id)
        .ok_or_else(|| format!("session not found: {}", session_id))?;

    session.permission_mode = mode;
    Ok(())
}
