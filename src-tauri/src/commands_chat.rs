//! Tauri command handlers for chat functionality.

use std::path::PathBuf;
use tauri::{Emitter, State};

use cc_sdk::Message;
use futures::StreamExt;
use log::error;
use crate::chat;
use crate::state::{AppState, PermissionMode};

#[derive(Clone, serde::Serialize)]
pub struct ChatOutputEvent {
    pub part_type: String,   // "text", "tool_use", "tool_result", "thinking"
    pub content: String,
    pub tool_name: Option<String>,
    pub tool_input: Option<serde_json::Value>,
}

fn message_to_text(msg: &Message) -> String {
    match msg {
        Message::Assistant { message, .. } => {
            let mut parts = Vec::new();
            for block in &message.content {
                match block {
                    cc_sdk::ContentBlock::Text(tc) => parts.push(tc.text.clone()),
                    _ => {}
                }
            }
            parts.join("\n")
        }
        Message::Result { result, is_error, .. } => {
            if *is_error {
                format!("[Error] {}", result.as_deref().unwrap_or("Unknown error"))
            } else {
                result.clone().unwrap_or_default()
            }
        }
        Message::System { subtype, data, .. } => {
            format!("[{}] {}", subtype, data)
        }
        Message::User { message, .. } => {
            message.content.clone()
        }
        _ => serde_json::to_string(msg).unwrap_or_default(),
    }
}

#[tauri::command]
pub fn chat_create_session(
    profile_id: String,
    directory: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<chat::CreateChatSessionResult, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let _profile = store
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?
        .clone();
    drop(store);

    let dir = PathBuf::from(directory);
    // Use tokio runtime to call async function
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    rt.block_on(chat::create_chat_session(&profile_id, dir, app))
}

#[tauri::command]
pub async fn chat_send_message(
    session_id: String,
    content: String,
    _attachments: Option<Vec<String>>,
    _model: Option<String>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Get client handle
    let client = {
        let sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.client.clone()
    };

    // Emit thinking state
    let _ = app.emit(
        "session-state",
        serde_json::json!({ "session_id": session_id, "state": "thinking" }),
    );

    // Spawn async task to connect and send message
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    tokio::spawn(async move {
        // Lock client and connect
        let mut client = client.lock().await;
        if let Err(e) = client.connect(None).await {
            error!("Failed to connect: {}", e);
            let _ = app_clone.emit(
                "chat-message",
                ChatOutputEvent {
                    part_type: "text".to_string(),
                    content: format!("[Connection Error] {}", e),
                    tool_name: None,
                    tool_input: None,
                },
            );
            let _ = app_clone.emit(
                "session-state",
                serde_json::json!({ "session_id": session_id_clone, "state": "error" }),
            );
            return;
        }

        // Send message and stream response
        // Start receiving BEFORE sending (receive_messages() sets up the channel)
        let mut stream = client.receive_messages().await;
        match client.send_request(content.clone(), None).await {
            Ok(()) => {
                // Receive and forward messages
                while let Some(msg_result) = stream.next().await {
                    match msg_result {
                        Ok(msg) => {
                            let text = message_to_text(&msg);
                            if !text.is_empty() {
                                let _ = app_clone.emit(
                                    "chat-message",
                                    ChatOutputEvent {
                                        part_type: "text".to_string(),
                                        content: text,
                                        tool_name: None,
                                        tool_input: None,
                                    },
                                );
                            }
                        }
                        Err(e) => {
                            error!("Message error: {}", e);
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                error!("Send error: {}", e);
                let _ = app_clone.emit(
                    "chat-message",
                    ChatOutputEvent {
                        part_type: "text".to_string(),
                        content: format!("[Send Error] {}", e),
                        tool_name: None,
                        tool_input: None,
                    },
                );
            }
        }

        // Emit idle state
        let _ = app_clone.emit(
            "session-state",
            serde_json::json!({ "session_id": session_id_clone, "state": "idle" }),
        );
    });

    Ok(())
}

#[tauri::command]
pub fn chat_list_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<chat::ChatSessionInfo>, String> {
    let sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions
        .iter()
        .map(|(id, h)| chat::ChatSessionInfo {
            session_id: id.clone(),
            name: h.session_name.clone(),
            state: h.state,
            cwd: h.cwd.clone(),
        })
        .collect())
}

#[tauri::command]
pub fn chat_get_recent_sessions(
    _profile_id: Option<String>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<chat::RecentSessionInfo>, String> {
    let sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
    let store = state.store.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(10);
    Ok(sessions
        .iter()
        .take(limit)
        .map(|(id, h)| {
            let profile_name = store
                .profiles
                .iter()
                .find(|p| p.id == h.profile_id)
                .map(|p| p.name.clone())
                .unwrap_or_default();
            chat::RecentSessionInfo {
                session_id: id.clone(),
                name: h.session_name.clone(),
                cwd: h.cwd.clone(),
                last_active: time::OffsetDateTime::now_utc(),
                profile_id: h.profile_id.clone(),
                profile_name,
            }
        })
        .collect())
}

#[tauri::command]
pub fn chat_delete_sessions(
    session_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
    for id in session_ids {
        sessions.remove(&id);
    }
    Ok(())
}

#[tauri::command]
pub fn chat_rename_session(
    session_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(h) = sessions.get_mut(&session_id) {
        h.session_name = name;
    }
    Ok(())
}

#[tauri::command]
pub fn chat_resume_session(
    session_id: String,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    // Resume by reattaching to existing client
    Ok(session_id)
}

#[tauri::command]
pub fn chat_close_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    rt.block_on(chat::close_chat_session(&session_id, state))
}

#[tauri::command]
pub fn chat_set_permission_mode(
    session_id: String,
    mode: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mode = match mode.as_str() {
        "default" => PermissionMode::Default,
        "accept_edits" => PermissionMode::AcceptEdits,
        "plan" => PermissionMode::Plan,
        _ => return Err(format!("Unknown permission mode: {}", mode)),
    };
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    rt.block_on(chat::set_permission_mode(&session_id, mode, state))
}

#[tauri::command]
pub fn chat_get_token_usage(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Token usage from cc-sdk — placeholder for now
    let _ = session_id;
    let _ = state;
    Ok(serde_json::json!({
        "context_pct": 0,
        "subscription_pct": 0
    }))
}

#[tauri::command]
pub fn chat_cancel(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let _ = session_id;
    let _ = state;
    Ok(())
}

#[tauri::command]
pub fn chat_undo(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let _ = session_id;
    let _ = state;
    Ok(())
}

#[tauri::command]
pub fn chat_redo(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let _ = session_id;
    let _ = state;
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct SlashCommand {
    pub name: String,
    pub description: String,
    pub argument_hint: Option<String>,
}

/// Get available slash commands for a session.
/// Falls back to static list — cc-sdk does not expose dynamic command discovery.
#[tauri::command]
pub fn chat_get_slash_commands(
    _session_id: String,
    _state: State<'_, AppState>,
) -> Result<Vec<SlashCommand>, String> {
    // Static list — cc-sdk built-in slash commands
    let builtin = vec![
        SlashCommand { name: "help".into(), description: "Show available commands".into(), argument_hint: None },
        SlashCommand { name: "clear".into(), description: "Clear the conversation".into(), argument_hint: None },
        SlashCommand { name: "model".into(), description: "Switch model".into(), argument_hint: Some("<model-id>".into()) },
        SlashCommand { name: "cancel".into(), description: "Cancel the current request".into(), argument_hint: None },
        SlashCommand { name: "context".into(), description: "Show context usage".into(), argument_hint: None },
        SlashCommand { name: "debug".into(), description: "Toggle debug mode".into(), argument_hint: None },
        SlashCommand { name: "resume".into(), description: "Resume an existing session".into(), argument_hint: None },
        SlashCommand { name: "fork".into(), description: "Fork the current session".into(), argument_hint: None },
    ];

    // 'rewind' is a native cc-sdk command — always available
    let mut commands = builtin;
    commands.push(SlashCommand {
        name: "rewind".into(),
        description: "Rewind tracked files to a previous user message".into(),
        argument_hint: Some("[user-message-uuid]".into()),
    });

    Ok(commands)
}