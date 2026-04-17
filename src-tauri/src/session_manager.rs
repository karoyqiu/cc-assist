//! Chat session management using cc-sdk InteractiveClient.
//!
//! Architecture:
//! - Each session runs in its own std thread with a tokio Runtime.
//! - InteractiveClient (not Send) is stored in Arc<Mutex<Option<...>>> on the thread.
//! - For streaming, we acquire the lock, take client out, spawn async task that
//!   returns client when done. This lets us use client across await points.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use cc_sdk::{ClaudeCodeOptions, InteractiveClient, Message, TokenUsageTracker};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::runtime::Runtime;
use tokio::sync::oneshot;

use crate::types::ProfileConfig;

// ============================================================================
// Types
// ============================================================================

/// Handle to a live chat session. Cloneable so Tauri commands can share it.
#[derive(Clone)]
pub struct ChatSessionHandle {
    pub id: String,
    pub name: String,
    pub profile_id: String,
    pub directory: PathBuf,
    pub cmd_sender: mpsc::Sender<ChatCommand>,
}

/// Command sent from Tauri command handlers to the session thread.
#[derive(Debug)]
pub enum ChatCommand {
    /// Send a message (user text). arg: (message_id, content)
    SendMessage(String, String),
    /// Approve a tool call with optional modified args.
    ApproveTool(String, Option<serde_json::Value>),
    /// Deny a tool call.
    DenyTool(String),
    /// Send input for waiting_input state.
    SendInput(String),
    /// Stop/cancel the current in-flight request.
    Stop,
    /// Close the session thread.
    Close,
}

/// Session runtime state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Idle,
    Running,
    WaitingPermission {
        tool_call_id: String,
        tool_name: String,
    },
    WaitingInput,
}

impl SessionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionState::Idle => "idle",
            SessionState::Running => "running",
            SessionState::WaitingPermission { .. } => "waiting_permission",
            SessionState::WaitingInput => "waiting_input",
        }
    }
}

/// A queued message waiting to be sent.
#[derive(Debug, Clone)]
struct QueuedMessage {
    id: String,
    content: String,
}

/// Streaming chunk sent to frontend.
#[derive(Clone, Serialize)]
pub struct StreamChunk {
    pub session_id: String,
    pub message_id: String,
    pub chunk: String,
    pub done: bool,
    pub error: Option<String>,
}

/// Result sent back from streaming task when done.
enum StreamingDone {
    Completed,
    Interrupted,
    Error(String),
}

// ============================================================================
// Session Thread
// ============================================================================

/// Start a new session thread owning an InteractiveClient.
pub fn spawn_session_thread(
    session_id: String,
    profile: &ProfileConfig,
    directory: PathBuf,
    app: AppHandle,
) -> Result<ChatSessionHandle, String> {
    let profile_id = profile.id.clone();
    let profile_name = profile.name.clone();

    // Build ClaudeCodeOptions with per-session cwd.
    let options = ClaudeCodeOptions::builder()
        .cwd(directory.clone())
        .build();

    // Command channel (std mpsc)
    let (cmd_tx, cmd_rx) = mpsc::channel();

    // Build session name
    let name = if directory.file_name().is_some() {
        format!(
            "{} ({})",
            directory.file_name().unwrap().to_string_lossy(),
            profile_name
        )
    } else {
        format!("{} ({})", directory.display(), profile_name)
    };

    let session_id_clone = session_id.clone();
    let app_clone = app.clone();

    // Spawn session thread
    thread::spawn(move || {
        let rt = match Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                log::error!("[{}] Failed to create tokio runtime: {}", session_id_clone, e);
                return;
            }
        };

        // Create and connect the client
        let mut client = match InteractiveClient::new(options) {
            Ok(c) => c,
            Err(e) => {
                log::error!(
                    "[{}] Failed to create InteractiveClient: {}",
                    session_id_clone,
                    e
                );
                return;
            }
        };

        if let Err(e) = rt.block_on(client.connect()) {
            log::error!("[{}] Failed to connect: {}", session_id_clone, e);
            return;
        }

        // Wrap client in Arc<Mutex> so we can move it into async tasks
        let mut client = Arc::new(Mutex::new(Some(client)));

        // Session state
        let mut current_state = SessionState::Idle;
        let mut message_queue: VecDeque<QueuedMessage> = VecDeque::new();
        let _token_tracker = TokenUsageTracker::new(); // TODO: wire into chat_get_usage
        let mut current_message_id: Option<String> = None;
        let mut streaming_done_rx: Option<oneshot::Receiver<StreamingDone>> = None;

        let emit_state = |app: &AppHandle, sid: &str, s: &SessionState| {
            let _ = app.emit(
                "chat-session-state",
                &serde_json::json!({
                    "session_id": sid,
                    "state": s.as_str(),
                }),
            );
        };

        loop {
            // Check if streaming task completed
            if let Some(ref mut rx) = streaming_done_rx {
                if rx.try_recv().is_ok() {
                    streaming_done_rx = None;
                    current_state = SessionState::Idle;
                    current_message_id = None;
                    emit_state(&app_clone, &session_id_clone, &current_state);

                    // Drain queue
                    if let Some(next) = message_queue.pop_front() {
                        current_message_id = Some(next.id.clone());
                        current_state = SessionState::Running;
                        emit_state(&app_clone, &session_id_clone, &current_state);

                        // Take client from Arc
                        let mut client_opt = client.lock().unwrap();
                        if let Some(mut c) = client_opt.take() {
                            let msg_id_clone = next.id.clone();
                            let sid = session_id_clone.clone();
                            let app_s = app_clone.clone();
                            let client_arc = client.clone();

                            // Set up abort channel
                            let (_abort_tx, abort_rx) = oneshot::channel();
                            let (done_tx, done_rx) = oneshot::channel();
                            streaming_done_rx = Some(done_rx);

                            rt.spawn(async move {
                                let result = stream_message(&mut c, msg_id_clone, sid.clone(), app_s.clone(), abort_rx, next.content).await;
                                let _ = done_tx.send(result);
                                // Return client to Arc
                                *client_arc.lock().unwrap() = Some(c);
                            });
                        }
                    }
                }
            }

            // Process commands with short timeout
            match cmd_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(ChatCommand::SendMessage(content, msg_id)) => {
                    // If streaming is active, queue
                    if streaming_done_rx.is_some() {
                        if message_queue.len() >= 10 {
                            let chunk = StreamChunk {
                                session_id: session_id_clone.clone(),
                                message_id: msg_id,
                                chunk: String::new(),
                                done: true,
                                error: Some("Message queue full (max 10)".to_string()),
                            };
                            let _ = app_clone.emit("chat-stream-chunk", &chunk);
                            continue;
                        }
                        message_queue.push_back(QueuedMessage { id: msg_id, content });
                        continue;
                    }

                    // Start new message
                    current_message_id = Some(msg_id.clone());
                    current_state = SessionState::Running;
                    emit_state(&app_clone, &session_id_clone, &current_state);

                    // Take client from Arc
                    let mut client_opt = client.lock().unwrap();
                    if let Some(mut c) = client_opt.take() {
                        let msg_id_clone = msg_id.clone();
                        let sid = session_id_clone.clone();
                        let app_s = app_clone.clone();
                        let client_arc = client.clone();

                        // Set up abort and done channels
                        let (abort_tx, abort_rx) = oneshot::channel();
                        let (done_tx, done_rx) = oneshot::channel();
                        streaming_done_rx = Some(done_rx);

                        rt.spawn(async move {
                            let result = stream_message(&mut c, msg_id_clone, sid.clone(), app_s.clone(), abort_rx, content).await;
                            let _ = done_tx.send(result);
                            *client_arc.lock().unwrap() = Some(c);
                        });
                    } else {
                        // No client available (shouldn't happen)
                        current_state = SessionState::Idle;
                        emit_state(&app_clone, &session_id_clone, &current_state);
                    }
                }
                Ok(ChatCommand::Stop) => {
                    // Abort streaming if active
                    if streaming_done_rx.is_some() {
                        // Can't easily abort — just let it finish
                        // For now, clear queue but let stream drain
                        message_queue.clear();
                    }
                    // Interrupt client if possible
                    {
                        let mut client_guard = client.lock().unwrap();
                        if let Some(ref mut c) = *client_guard {
                            let _ = rt.block_on(c.interrupt());
                        }
                    }
                    current_state = SessionState::Idle;
                    current_message_id = None;
                    emit_state(&app_clone, &session_id_clone, &current_state);
                    message_queue.clear();
                }
                Ok(ChatCommand::Close) | Err(RecvTimeoutError::Disconnected) => {
                    let _ = rt.block_on(async {
                        let mut client_guard = client.lock().unwrap();
                        if let Some(ref mut c) = *client_guard {
                            let _ = c.disconnect();
                        }
                    });
                    break;
                }
                Ok(ChatCommand::ApproveTool(_tool_call_id, _modified_args)) => {
                    current_state = SessionState::Running;
                    emit_state(&app_clone, &session_id_clone, &current_state);
                }
                Ok(ChatCommand::DenyTool(_tool_call_id)) => {
                    current_state = SessionState::Running;
                    emit_state(&app_clone, &session_id_clone, &current_state);
                }
                Ok(ChatCommand::SendInput(_content)) => {
                    current_state = SessionState::Running;
                    emit_state(&app_clone, &session_id_clone, &current_state);
                }
                Err(RecvTimeoutError::Timeout) => {}
            }
        }
    });

    Ok(ChatSessionHandle {
        id: session_id,
        name,
        profile_id,
        directory,
        cmd_sender: cmd_tx,
    })
}

/// Run the streaming loop for one message. Returns client ownership to caller.
async fn stream_message(
    client: &mut InteractiveClient,
    msg_id: String,
    session_id: String,
    app: AppHandle,
    abort_rx: oneshot::Receiver<()>,
    content: String,
) -> StreamingDone {
    // Send message first
    if let Err(e) = client.send_message(content).await {
        return StreamingDone::Error(format!("Send failed: {}", e));
    }

    let stream = client.receive_messages_stream().await;
    tokio::pin!(stream);
    let mut interrupted = false;

    tokio::pin!(abort_rx);

    loop {
        tokio::select! {
            biased; // Prefer abort signal

            _ = &mut abort_rx => {
                interrupted = true;
                break;
            }

            msg_result = stream.next() => {
                match msg_result {
                    Some(Ok(Message::Assistant { message })) => {
                        if let Some(text) = extract_text_content(&message.content) {
                            let chunk = StreamChunk {
                                session_id: session_id.clone(),
                                message_id: msg_id.clone(),
                                chunk: text,
                                done: false,
                                error: None,
                            };
                            let _ = app.emit("chat-stream-chunk", &chunk);
                        }
                    }
                    Some(Ok(Message::Result { usage, total_cost_usd, .. })) => {
                        let _ = (usage, total_cost_usd);
                        let chunk = StreamChunk {
                            session_id: session_id.clone(),
                            message_id: msg_id.clone(),
                            chunk: String::new(),
                            done: true,
                            error: None,
                        };
                        let _ = app.emit("chat-stream-chunk", &chunk);
                        break;
                    }
                    Some(Ok(Message::System { subtype, data, .. })) => {
                        if subtype == "tool_call" {
                            if let Some((tcid, tname, args)) = parse_tool_call(&data) {
                                let _ = app.emit("chat-tool-call", &serde_json::json!({
                                    "session_id": session_id,
                                    "tool_call_id": tcid,
                                    "tool_name": tname,
                                    "arguments": args,
                                }));
                            }
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        return StreamingDone::Error(format!("Stream error: {}", e));
                    }
                    None => break,
                }
            }
        }
    }

    if interrupted {
        StreamingDone::Interrupted
    } else {
        StreamingDone::Completed
    }
}

// ============================================================================
// Helpers
// ============================================================================

fn extract_text_content(content: &[cc_sdk::ContentBlock]) -> Option<String> {
    for block in content {
        if let cc_sdk::ContentBlock::Text(text) = block {
            return Some(text.text.clone());
        }
    }
    None
}

fn parse_tool_call(
    data: &serde_json::Value,
) -> Option<(String, String, serde_json::Value)> {
    let tool_call = data.get("tool_call")?;
    let tool_use = tool_call.get("tool_use")?;
    let tool_call_id = tool_use.get("tool_call_id")?.as_str()?.to_string();
    let tool_name = tool_use.get("name")?.as_str()?.to_string();
    let args = tool_use.get("input")?.clone();
    Some((tool_call_id, tool_name, args))
}
