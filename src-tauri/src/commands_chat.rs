use tauri::{AppHandle, State};
use time::OffsetDateTime;

use crate::chat;
use crate::permission_allowlist::AllowlistEntry;
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct SessionInfoDto {
    pub session_id: String,
    pub name: String,
    pub profile_id: String,
    pub state: crate::state::SessionState,
    pub cwd: std::path::PathBuf,
    pub last_used_at: String,
    pub message_count: u32,
}

#[tauri::command]
pub async fn chat_create_session(
    profile_id: String,
    directory: String,
    app: AppHandle,
) -> Result<chat::CreateChatSessionResult, String> {
    chat::create_chat_session(&profile_id, std::path::PathBuf::from(directory), app).await
}

#[tauri::command]
pub async fn chat_close_session(session_id: String, app: AppHandle) -> Result<(), String> {
    chat::close_chat_session(&session_id, app).await
}

#[tauri::command]
pub async fn chat_send_message(
    session_id: String,
    content: String,
    attachments: Option<Vec<String>>,
    app: AppHandle,
) -> Result<(), String> {
    chat::send_message(&session_id, content, attachments, app).await
}

#[tauri::command]
pub async fn chat_compact(session_id: String, app: AppHandle) -> Result<(), String> {
    chat::compact_session(&session_id, app).await
}

#[tauri::command]
pub async fn chat_list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfoDto>, String> {
    let sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions
        .iter()
        .map(|(id, s)| SessionInfoDto {
            session_id: id.clone(),
            name: s.session_name.clone(),
            profile_id: String::new(),
            state: s.state,
            cwd: s.cwd.clone(),
            last_used_at: OffsetDateTime::now_utc().to_string(),
            message_count: 0,
        })
        .collect())
}

#[tauri::command]
pub async fn chat_delete_sessions(
    session_ids: Vec<String>,
    app: AppHandle,
) -> Result<(), String> {
    for id in &session_ids {
        chat::close_chat_session(id, app.clone()).await.ok();
    }
    Ok(())
}

#[tauri::command]
pub async fn chat_delete_outdated_sessions(
    _days: u32,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // cc-sdk sessions are managed externally; placeholder returns 0
    Ok(serde_json::json!({ "deleted": 0 }))
}

#[tauri::command]
pub async fn chat_delete_small_sessions(
    _min_messages: u32,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "deleted": 0 }))
}

#[tauri::command]
pub async fn chat_set_permission_mode(
    session_id: String,
    mode: crate::state::PermissionMode,
    app: AppHandle,
) -> Result<(), String> {
    chat::set_permission_mode(&session_id, mode, app).await
}

#[tauri::command]
pub async fn chat_allow_permission(
    session_id: String,
    tool_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
    let cwd = sessions
        .get(&session_id)
        .map(|s| s.cwd.clone())
        .unwrap_or_default();
    drop(sessions);

    let app_data_dir = state.app_data_dir.lock().unwrap().clone();
    let mut allowlist = state.allowlist.lock().map_err(|e| e.to_string())?;
    let cmd = crate::permission_allowlist::resolve_command(&tool_name, &cwd);
    let cmd_name = cmd.split_whitespace().next().unwrap_or(cmd);
    allowlist.allow(cmd_name);
    allowlist.save(&app_data_dir).ok();
    Ok(())
}

#[tauri::command]
pub async fn chat_deny_permission(
    _session_id: String,
    _tool_name: String,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn chat_answer_question(
    session_id: String,
    answer: String,
    app: AppHandle,
) -> Result<(), String> {
    chat::send_message(&session_id, answer, None, app).await
}

#[tauri::command]
pub async fn chat_get_allowlist(
    state: State<'_, AppState>,
) -> Result<Vec<AllowlistEntry>, String> {
    let allowlist = state.allowlist.lock().map_err(|e| e.to_string())?;
    Ok(allowlist.entries_sorted().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn chat_remove_from_allowlist(
    commands: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let app_data_dir = state.app_data_dir.lock().unwrap().clone();
    let mut allowlist = state.allowlist.lock().map_err(|e| e.to_string())?;
    allowlist.remove(&commands);
    allowlist.save(&app_data_dir).ok();
    Ok(())
}

#[tauri::command]
pub async fn chat_clear_allowlist(state: State<'_, AppState>) -> Result<(), String> {
    let app_data_dir = state.app_data_dir.lock().unwrap().clone();
    let mut allowlist = state.allowlist.lock().map_err(|e| e.to_string())?;
    allowlist.clear();
    allowlist.save(&app_data_dir).ok();
    Ok(())
}
