use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use time::OffsetDateTime;
use uuid::Uuid;

use cc_sdk::{ClaudeCodeOptions, ClaudeSDKClient};

use crate::state::{AppState, ChatSession, PermissionMode, SessionState};

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

    let _profile = store
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("profile not found: {}", profile_id))?;

    drop(store);

    // Build ClaudeCodeOptions with project settings
    let options = ClaudeCodeOptions::builder()
        .setting_sources(vec![cc_sdk::SettingSource::Project])
        .cwd(directory.clone())
        .build();

    // Create the cc-sdk client
    let client = ClaudeSDKClient::new(options);

    // Generate session name and ID
    let session_id = Uuid::new_v4().to_string();
    let name = format!("session-{}", &session_id[..8]);

    // Store the session
    let session = ChatSession {
        client,
        permission_mode: PermissionMode::Default,
        state: SessionState::Idle,
        cwd: directory.clone(),
        session_name: name.clone(),
        profile_id: profile_id.to_string(),
        last_used_at: OffsetDateTime::now_utc(),
        message_count: 0,
    };

    state
        .chat_sessions
        .sessions
        .lock()
        .map_err(|e| format!("failed to lock chat sessions: {}", e))?
        .insert(session_id.clone(), session);

    Ok(CreateChatSessionResult {
        session_id,
        name,
        cwd: directory,
    })
}

/// Closes and removes a chat session.
pub async fn close_chat_session(
    session_id: &str,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();
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

/// Sends a message on an existing session and streams response via Tauri events.
pub async fn send_message(
    session_id: &str,
    content: String,
    _attachments: Option<Vec<String>>,
    app: AppHandle,
) -> Result<(), String> {
    use crate::state::SessionState;
    let state = app.state::<AppState>();
    // Mark session as thinking and update usage stats
    {
        let mut sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(s) = sessions.get_mut(session_id) {
            s.state = SessionState::Thinking;
            s.last_used_at = OffsetDateTime::now_utc();
            s.message_count += 1;
        }
    }
    app.emit(
        "session-state",
        serde_json::json!({ "session_id": session_id, "state": "thinking" }),
    )
    .ok();

    // Spawn streaming task
    let session_id_owned = session_id.to_string();
    tokio::spawn(async move {
        log::info!("send_message streaming for session {}", session_id_owned);
        // TODO: wire actual cc-sdk streaming in a follow-up task
        let _ = content;
    });
    Ok(())
}

/// Sends /compact to the active session.
pub async fn compact_session(session_id: &str, app: AppHandle) -> Result<(), String> {
    send_message(session_id, "/compact".to_string(), None, app).await
}

/// Updates the permission mode for an existing session.
pub async fn set_permission_mode(
    session_id: &str,
    mode: PermissionMode,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();
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
