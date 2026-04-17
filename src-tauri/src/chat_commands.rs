//! Tauri commands for chat session management.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::session_manager::{self, ChatSessionHandle, SessionState};
use crate::state::AppState;
use crate::types::ProfileConfig;

/// Live chat session with metadata for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSession {
    pub id: String,
    pub name: String,
    pub profile_id: String,
    pub directory: String,
    pub state: String,
}

/// Create a new chat session and register it in AppState.
#[tauri::command]
pub async fn chat_create_session(
    profile_id: String,
    directory: PathBuf,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LiveSession, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    // Get profile config
    let profile = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        store
            .profiles
            .iter()
            .find(|p| p.id == profile_id)
            .cloned()
            .ok_or_else(|| format!("Profile not found: {}", profile_id))?
    };

    // Spawn session thread
    let handle = session_manager::spawn_session_thread(
        session_id.clone(),
        &profile,
        directory.clone(),
        app.clone(),
    )
    .map_err(|e| e)?;

    let session = LiveSession {
        id: handle.id.clone(),
        name: handle.name.clone(),
        profile_id: handle.profile_id.clone(),
        directory: directory.to_string_lossy().to_string(),
        state: "idle".to_string(),
    };

    // Register in AppState
    {
        let mut sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.clone(), handle);
    }

    // Emit session list update
    let _ = app.emit("chat-sessions-updated", &());

    Ok(session)
}

/// Send a message to a chat session. Streaming chunks are forwarded via the Channel.
#[tauri::command]
pub async fn chat_send_message(
    session_id: String,
    content: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let handle = {
        let sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| format!("Session not found: {}", session_id))?
    };

    let msg_id = uuid::Uuid::new_v4().to_string();

    // Register event listeners for this message
    let app_clone = app.clone();
    let msg_id_clone = msg_id.clone();
    let sid_clone = session_id.clone();

    // Listen for stream chunks from this session and forward via a oneshot
    // Since we use app.emit for all chunks, we just need to validate the session is active
    handle
        .cmd_sender
        .send(session_manager::ChatCommand::SendMessage(content, msg_id))
        .map_err(|e| format!("Failed to send message: {}", e))?;

    Ok(())
}

/// Approve a tool call.
#[tauri::command]
pub async fn chat_tool_approve(
    session_id: String,
    tool_call_id: String,
    modified_args: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let handle = {
        let sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| format!("Session not found: {}", session_id))?
    };

    handle
        .cmd_sender
        .send(session_manager::ChatCommand::ApproveTool(
            tool_call_id,
            modified_args,
        ))
        .map_err(|e| format!("Failed to send approve: {}", e))?;

    Ok(())
}

/// Deny a tool call.
#[tauri::command]
pub async fn chat_tool_deny(
    session_id: String,
    tool_call_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let handle = {
        let sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| format!("Session not found: {}", session_id))?
    };

    handle
        .cmd_sender
        .send(session_manager::ChatCommand::DenyTool(tool_call_id))
        .map_err(|e| format!("Failed to send deny: {}", e))?;

    Ok(())
}

/// Send input for waiting_input state.
#[tauri::command]
pub async fn chat_send_input(
    session_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let handle = {
        let sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| format!("Session not found: {}", session_id))?
    };

    handle
        .cmd_sender
        .send(session_manager::ChatCommand::SendInput(content))
        .map_err(|e| format!("Failed to send input: {}", e))?;

    Ok(())
}

/// Stop the current in-flight request.
#[tauri::command]
pub async fn chat_stop(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let handle = {
        let sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| format!("Session not found: {}", session_id))?
    };

    handle
        .cmd_sender
        .send(session_manager::ChatCommand::Stop)
        .map_err(|e| format!("Failed to send stop: {}", e))?;

    Ok(())
}

/// Close a chat session (removes from memory, session persists in Claude Code store).
#[tauri::command]
pub async fn chat_close_session(
    session_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let handle = {
        let mut sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .remove(&session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?
    };

    handle
        .cmd_sender
        .send(session_manager::ChatCommand::Close)
        .map_err(|e| format!("Failed to send close: {}", e))?;

    let _ = app.emit("chat-sessions-updated", &());

    Ok(())
}

/// Get the current state of a session.
#[tauri::command]
pub async fn chat_get_state(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let _sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
    // State is tracked internally by the session manager
    // For now return "idle" as placeholder — state events are emitted separately
    Ok("idle".to_string())
}

/// Get all live chat sessions.
#[tauri::command]
pub async fn chat_get_sessions(state: State<'_, AppState>) -> Result<Vec<LiveSession>, String> {
    let sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
    let result = sessions
        .values()
        .map(|h| LiveSession {
            id: h.id.clone(),
            name: h.name.clone(),
            profile_id: h.profile_id.clone(),
            directory: h.directory.to_string_lossy().to_string(),
            state: "idle".to_string(), // State tracked via events
        })
        .collect();
    Ok(result)
}

/// Get usage statistics for a session (context %, subscription %).
/// This is a placeholder — actual usage tracking is done by TokenUsageTracker
/// inside the session manager.
#[tauri::command]
pub async fn chat_get_usage(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let _sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
    // Placeholder — would need to add a query channel to session manager
    Ok(serde_json::json!({
        "context_percent": 0.0,
        "subscription_percent": 0.0,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_cost_usd": 0.0,
    }))
}

/// Trigger context compaction for a session.
#[tauri::command]
pub async fn chat_compact_context(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<f64, String> {
    let _sessions = state.chat_sessions.lock().map_err(|e| e.to_string())?;
    // Deferred: cc-sdk doesn't expose get_context_usage directly
    // Requires investigation of SDK control protocol
    Ok(0.0)
}

/// Stored session info from Claude Code's session store.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSession {
    pub session_id: String,
    pub summary: String,
    pub last_modified: i64,
    pub custom_title: Option<String>,
    pub first_prompt: Option<String>,
    pub cwd: Option<String>,
}

/// List all stored sessions from Claude Code's session store.
#[tauri::command]
pub async fn chat_list_stored_sessions(
    directory: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<StoredSession>, String> {
    let sessions = cc_sdk::sessions::list_sessions(
        directory.as_deref(),
        limit,
        true, // include_worktrees
    )
    .await
    .map_err(|e| format!("Failed to list sessions: {}", e))?;

    let result: Vec<StoredSession> = sessions
        .into_iter()
        .map(|s| StoredSession {
            session_id: s.session_id,
            summary: s.summary,
            last_modified: s.last_modified,
            custom_title: s.custom_title,
            first_prompt: s.first_prompt,
            cwd: s.cwd,
        })
        .collect();
    Ok(result)
}

/// Rename a stored session.
#[tauri::command]
pub async fn chat_rename_session(
    session_id: String,
    title: String,
) -> Result<(), String> {
    cc_sdk::sessions::rename_session(&session_id, &title)
        .await
        .map_err(|e| format!("Failed to rename session: {}", e))
}
