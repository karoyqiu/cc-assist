use std::path::PathBuf;
use std::sync::Arc;

use futures::StreamExt;
use tauri::{AppHandle, Emitter, Manager};
use time::OffsetDateTime;
use uuid::Uuid;

use cc_sdk::{ClaudeCodeOptions, ClaudeSDKClient, ContentBlock, Message};
use crate::types::ProfileConfig;

use crate::state::{AppState, ChatSession, PermissionMode, SessionState};

/// Result of creating a new chat session.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChatSessionResult {
    pub session_id: String,
    pub name: String,
    pub cwd: PathBuf,
}

fn make_client(options: ClaudeCodeOptions) -> Arc<tokio::sync::Mutex<ClaudeSDKClient>> {
    Arc::new(tokio::sync::Mutex::new(ClaudeSDKClient::new(options)))
}

fn build_options(profile: &ProfileConfig, cwd: PathBuf, resume: Option<String>) -> ClaudeCodeOptions {
    let mut options = ClaudeCodeOptions::builder()
        .setting_sources(vec![cc_sdk::SettingSource::User, cc_sdk::SettingSource::Project])
        .cwd(cwd)
        .build();

    options.stderr_callback = Some(std::sync::Arc::new(|line: &str| {
        log::warn!("claude stderr: {}", line);
    }));

    // Profile credentials and model overrides
    options.env.insert("ANTHROPIC_AUTH_TOKEN".to_string(), profile.api_key.clone());
    if !profile.base_url.is_empty() {
        options.env.insert("ANTHROPIC_BASE_URL".to_string(), profile.base_url.clone());
    }
    if let Some(proxy) = &profile.proxy_url {
        options.env.insert("HTTPS_PROXY".to_string(), proxy.clone());
    }
    if let Some(model) = &profile.models.main {
        options.env.insert("ANTHROPIC_MODEL".to_string(), model.clone());
    }
    if let Some(model) = &profile.models.haiku {
        options.env.insert("ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(), model.clone());
    }
    if let Some(model) = &profile.models.sonnet {
        options.env.insert("ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(), model.clone());
    }
    if let Some(model) = &profile.models.opus {
        options.env.insert("ANTHROPIC_DEFAULT_OPUS_MODEL".to_string(), model.clone());
    }
    if let Some(session_id) = resume {
        options.resume = Some(session_id);
    }
    // Enable control protocol so set_permission_mode works mid-session.
    options.enable_file_checkpointing = true;
    options
}

/// Creates a new chat session for the given profile and working directory.
pub async fn create_chat_session(
    profile_id: &str,
    directory: PathBuf,
    app: AppHandle,
) -> Result<CreateChatSessionResult, String> {
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

    let client = make_client(build_options(&profile, directory.clone(), None));
    let session_id = Uuid::new_v4().to_string();
    let name = format!("session-{}", &session_id[..8]);

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
pub async fn close_chat_session(session_id: &str, app: AppHandle) -> Result<(), String> {
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

/// Sends a message on an existing session and streams the response via Tauri events.
pub async fn send_message(
    session_id: &str,
    content: String,
    _attachments: Option<Vec<String>>,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();

    // Lock sessions briefly: update state, grab client Arc, then release.
    let client_arc = {
        let mut sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
        let s = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("session not found: {}", session_id))?;
        s.state = SessionState::Thinking;
        s.last_used_at = OffsetDateTime::now_utc();
        s.message_count += 1;
        Arc::clone(&s.client)
    };

    app.emit(
        "session-state",
        serde_json::json!({ "sessionId": session_id, "state": "thinking" }),
    )
    .ok();

    let session_id_owned = session_id.to_string();
    let app_clone = app.clone();

    tokio::spawn(async move {
        // Connect + send, then release the client lock before streaming.
        let stream = {
            let mut client = client_arc.lock().await;
            log::info!("[{}] connecting to claude CLI", session_id_owned);
            if let Err(e) = client.connect(None).await {
                log::error!("[{}] connect failed: {e}", session_id_owned);
                emit_error(&app_clone, &session_id_owned);
                return;
            }
            log::info!("[{}] sending request", session_id_owned);
            if let Err(e) = client.send_request(content, None).await {
                log::error!("[{}] send_request failed: {e}", session_id_owned);
                emit_error(&app_clone, &session_id_owned);
                return;
            }
            log::info!("[{}] receiving messages stream", session_id_owned);
            // Sync permission mode from the init system message (top-level field
            // that cc-sdk drops from Message::System.data).
            if let Some(info) = client.get_server_info().await {
                if let Some(mode_str) = info.get("permissionMode").and_then(|v| v.as_str()) {
                    if let Some(mode) = parse_permission_mode(mode_str) {
                        sync_permission_mode(&app_clone, &session_id_owned, mode);
                    }
                }
            }
            client.receive_messages().await
        };

        let mut stream = std::pin::pin!(stream);
        let mut had_assistant_output = false;
        let mut full_text = String::new();
        log::info!("[{}] entering stream loop", session_id_owned);
        while let Some(msg_result) = stream.next().await {
            log::info!("[{}] stream item: ok={}", session_id_owned, msg_result.is_ok());
            match msg_result {
                Ok(Message::Assistant { message }) => {
                    for block in &message.content {
                        if let ContentBlock::Text(tc) = block {
                            had_assistant_output = true;
                            full_text.push_str(&tc.text);
                            app_clone
                                .emit(
                                    "chat-output",
                                    serde_json::json!({
                                        "sessionId": session_id_owned,
                                        "content": tc.text,
                                        "partType": "text",
                                    }),
                                )
                                .ok();
                        }
                    }
                }
                Ok(Message::Result { usage, is_error, result, subtype, .. }) => {
                    log::info!("[{}] result: subtype={} is_error={} result={:?}", session_id_owned, subtype, is_error, result);
                    // Slash commands and errors return output in result.result with no
                    // preceding Assistant messages. Surface it as a text chunk so the
                    // UI always shows something.
                    if !had_assistant_output
                        && let Some(text) = &result
                        && !text.is_empty()
                    {
                        app_clone.emit("chat-output", serde_json::json!({
                            "sessionId": session_id_owned,
                            "content": text,
                            "partType": "text",
                        })).ok();
                    }
                    // Detect plan mode toggling from assistant response text.
                    if let Some(mode) = detect_permission_mode_change(&full_text) {
                        sync_permission_mode(&app_clone, &session_id_owned, mode);
                    }
                    app_clone
                        .emit(
                            "result",
                            serde_json::json!({
                                "sessionId": session_id_owned,
                                "usage": usage,
                            }),
                        )
                        .ok();
                    set_session_state(&app_clone, &session_id_owned, SessionState::Idle);
                    app_clone
                        .emit(
                            "session-state",
                            serde_json::json!({ "sessionId": session_id_owned, "state": "idle" }),
                        )
                        .ok();
                    break;
                }
                Ok(Message::System { subtype, data }) => {
                    log::info!("[{}] system message: subtype={} data={}", session_id_owned, subtype, data);
                    // Sync permission mode if the CLI reports it in a system message.
                    if let Some(mode_str) = data.get("permissionMode").and_then(|v| v.as_str()) {
                        if let Some(mode) = parse_permission_mode(mode_str) {
                            sync_permission_mode(&app_clone, &session_id_owned, mode);
                        }
                    }
                    if subtype == "error" {
                        let detail = data.to_string();
                        log::error!("[{}] CLI system error: {}", session_id_owned, detail);
                        app_clone.emit("chat-output", serde_json::json!({
                            "sessionId": session_id_owned,
                            "content": format!("[CLI error] {detail}"),
                            "partType": "text",
                        })).ok();
                        emit_error(&app_clone, &session_id_owned);
                        break;
                    }
                }
                Ok(msg) => {
                    log::info!("[{}] unhandled message: {:?}", session_id_owned, msg);
                }
                Err(e) => {
                    log::error!("[{}] stream error: {}", session_id_owned, e);
                    emit_error(&app_clone, &session_id_owned);
                    break;
                }
            }
        }
        log::info!("[{}] stream loop ended", session_id_owned);
    });

    Ok(())
}

fn set_session_state(app: &AppHandle, session_id: &str, s: SessionState) {
    let state = app.state::<AppState>();
    if let Ok(mut sessions) = state.chat_sessions.sessions.lock()
        && let Some(session) = sessions.get_mut(session_id)
    {
        session.state = s;
    }
}

fn emit_error(app: &AppHandle, session_id: &str) {
    set_session_state(app, session_id, SessionState::Error);
    app.emit(
        "session-state",
        serde_json::json!({ "sessionId": session_id, "state": "error" }),
    )
    .ok();
    // Unblock the TauriChatModelAdapter which waits for a "result" event.
    app.emit(
        "result",
        serde_json::json!({ "sessionId": session_id, "usage": null }),
    )
    .ok();
}

fn parse_permission_mode(s: &str) -> Option<PermissionMode> {
    match s {
        "default" => Some(PermissionMode::Default),
        "acceptEdits" | "auto_accept_edits" => Some(PermissionMode::AcceptEdits),
        "plan" | "plan_mode" => Some(PermissionMode::Plan),
        _ => None,
    }
}

/// Detect permission mode change from assistant response text.
fn detect_permission_mode_change(text: &str) -> Option<PermissionMode> {
    let lower = text.to_lowercase();
    const ENTER_PLAN: &[&str] = &[
        "plan mode active",
        "plan mode is active",
        "plan mode activated",
        "plan mode is now active",
        "plan mode enabled",
        "entered plan mode",
        "entering plan mode",
        "switching to plan mode",
        "switched to plan mode",
        "now in plan mode",
        "i'm now in plan mode",
        "i am now in plan mode",
        "i've entered plan mode",
        "i have entered plan mode",
    ];
    const EXIT_PLAN: &[&str] = &[
        "exited plan mode",
        "exiting plan mode",
        "left plan mode",
        "leaving plan mode",
        "plan mode disabled",
        "plan mode deactivated",
        "switched from plan mode",
        "no longer in plan mode",
        "plan mode off",
    ];
    if ENTER_PLAN.iter().any(|p| lower.contains(p)) {
        return Some(PermissionMode::Plan);
    }
    if EXIT_PLAN.iter().any(|p| lower.contains(p)) {
        return Some(PermissionMode::Default);
    }
    None
}

/// Update permission mode in state and emit session-state event.
fn sync_permission_mode(app: &AppHandle, session_id: &str, mode: PermissionMode) {
    let state = app.state::<AppState>();
    if let Ok(mut sessions) = state.chat_sessions.sessions.lock()
        && let Some(session) = sessions.get_mut(session_id)
    {
        session.permission_mode = mode;
    }
    app.emit(
        "session-state",
        serde_json::json!({ "sessionId": session_id, "permissionMode": mode }),
    )
    .ok();
}

/// Sends /compact to the active session.
pub async fn compact_session(session_id: &str, app: AppHandle) -> Result<(), String> {
    send_message(session_id, "/compact".to_string(), None, app).await
}

/// Resumes an existing cc-sdk session by its session ID.
pub async fn resume_chat_session(
    profile_id: &str,
    sdk_session_id: &str,
    directory: PathBuf,
    app: AppHandle,
) -> Result<CreateChatSessionResult, String> {
    let state = app.state::<AppState>();
    let profile = state
        .store
        .lock()
        .map_err(|e| e.to_string())?
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("profile not found: {}", profile_id))?
        .clone();
    let client = make_client(build_options(&profile, directory.clone(), Some(sdk_session_id.to_string())));
    let session_id = Uuid::new_v4().to_string();
    let name = format!("session-{}", &session_id[..8]);
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
        .map_err(|e| e.to_string())?
        .insert(session_id.clone(), session);
    Ok(CreateChatSessionResult { session_id, name, cwd: directory })
}

/// Updates the permission mode for an existing session.
pub async fn set_permission_mode(
    session_id: &str,
    mode: PermissionMode,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();

    let client_arc = {
        let mut sessions = state
            .chat_sessions
            .sessions
            .lock()
            .map_err(|e| format!("failed to lock chat sessions: {}", e))?;

        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("session not found: {}", session_id))?;

        session.permission_mode = mode;
        Arc::clone(&session.client)
    };

    // Map to the SDK string the control protocol expects.
    let mode_str = match mode {
        PermissionMode::Default => "default",
        PermissionMode::AcceptEdits => "acceptEdits",
        PermissionMode::Plan => "plan",
    };

    if let Err(e) = client_arc.lock().await.set_permission_mode(mode_str).await {
        log::warn!("set_permission_mode SDK call failed (may not be connected yet): {e}");
    }

    app.emit(
        "session-state",
        serde_json::json!({ "sessionId": session_id, "permissionMode": mode }),
    )
    .ok();
    Ok(())
}
