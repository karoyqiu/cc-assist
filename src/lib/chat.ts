import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// =============================================================================
// Types (mirrors Rust LiveSession / StoredSession)
// =============================================================================

export interface LiveSession {
  id: string;
  name: string;
  profile_id: string;
  directory: string;
  state: string;
}

export interface StoredSession {
  session_id: string;
  summary: string;
  last_modified: number;
  custom_title: string | null;
  first_prompt: string | null;
  cwd: string | null;
}

export interface ChatUsage {
  context_percent: number;
  subscription_percent: number;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
}

export interface StreamChunk {
  session_id: string;
  message_id: string;
  chunk: string;
  done: boolean;
  error: string | null;
}

export interface ToolCallEvent {
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface SessionStateEvent {
  session_id: string;
  state: string;
}

// =============================================================================
// Session management
// =============================================================================

export async function chatCreateSession(
  profileId: string,
  directory: string,
): Promise<LiveSession> {
  return invoke<LiveSession>('chat_create_session', {
    profileId,
    directory,
  });
}

export async function chatCloseSession(sessionId: string): Promise<void> {
  return invoke('chat_close_session', { sessionId });
}

export async function chatGetSessions(): Promise<LiveSession[]> {
  return invoke<LiveSession[]>('chat_get_sessions');
}

export async function chatGetState(sessionId: string): Promise<string> {
  return invoke<string>('chat_get_state', { sessionId });
}

export async function chatGetUsage(sessionId: string): Promise<ChatUsage> {
  return invoke<ChatUsage>('chat_get_usage', { sessionId });
}

export async function chatCompactContext(sessionId: string): Promise<number> {
  return invoke<number>('chat_compact_context', { sessionId });
}

// =============================================================================
// Message sending
// =============================================================================

export async function chatSendMessage(sessionId: string, content: string): Promise<void> {
  return invoke('chat_send_message', { sessionId, content });
}

export async function chatStop(sessionId: string): Promise<void> {
  return invoke('chat_stop', { sessionId });
}

export async function chatSendInput(sessionId: string, content: string): Promise<void> {
  return invoke('chat_send_input', { sessionId, content });
}

// =============================================================================
// Tool approval / denial
// =============================================================================

export async function chatToolApprove(
  sessionId: string,
  toolCallId: string,
  modifiedArgs?: Record<string, unknown>,
): Promise<void> {
  return invoke('chat_tool_approve', {
    sessionId,
    toolCallId,
    modifiedArgs,
  });
}

export async function chatToolDeny(sessionId: string, toolCallId: string): Promise<void> {
  return invoke('chat_tool_deny', { sessionId, toolCallId });
}

// =============================================================================
// Stored sessions (Claude Code session store)
// =============================================================================

export async function chatListStoredSessions(
  directory?: string,
  limit?: number,
): Promise<StoredSession[]> {
  return invoke<StoredSession[]>('chat_list_stored_sessions', {
    directory,
    limit,
  });
}

export async function chatRenameSession(sessionId: string, title: string): Promise<void> {
  return invoke('chat_rename_session', { sessionId, title });
}

// =============================================================================
// Event listeners
// =============================================================================

export function onChatStreamChunk(handler: (chunk: StreamChunk) => void): Promise<UnlistenFn> {
  return listen<StreamChunk>('chat-stream-chunk', (event) => {
    handler(event.payload);
  });
}

export function onChatToolCall(handler: (event: ToolCallEvent) => void): Promise<UnlistenFn> {
  return listen<ToolCallEvent>('chat-tool-call', (event) => {
    handler(event.payload);
  });
}

export function onChatSessionState(
  handler: (event: SessionStateEvent) => void,
): Promise<UnlistenFn> {
  return listen<SessionStateEvent>('chat-session-state', (event) => {
    handler(event.payload);
  });
}

export function onChatSessionsUpdated(handler: () => void): Promise<UnlistenFn> {
  return listen('chat-sessions-updated', () => {
    handler();
  });
}
