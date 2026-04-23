import { invoke } from '@tauri-apps/api/core';

export interface CreateSessionResult {
  sessionId: string;
  name: string;
  cwd: string;
}

export interface SessionInfo {
  sessionId: string;
  name: string;
  profileId: string;
  state: 'idle' | 'thinking' | 'request_input' | 'request_permission' | 'error';
  cwd: string;
  lastUsedAt: string;
  messageCount: number;
}

export interface AllowlistEntry {
  command: string;
  approvedCount: number;
  lastApprovedAt: string;
}

export const chatCommands = {
  createSession: (profileId: string, directory: string) =>
    invoke<CreateSessionResult>('chat_create_session', { profileId, directory }),

  closeSession: (sessionId: string) => invoke<void>('chat_close_session', { sessionId }),

  sendMessage: (sessionId: string, content: string, attachments?: string[]) =>
    invoke<void>('chat_send_message', { sessionId, content, attachments }),

  listSessions: () => invoke<SessionInfo[]>('chat_list_sessions'),

  deleteSessions: (sessionIds: string[]) => invoke<void>('chat_delete_sessions', { sessionIds }),

  deleteOutdatedSessions: (days: number) =>
    invoke<{ deleted: number }>('chat_delete_outdated_sessions', { days }),

  deleteSmallSessions: (minMessages: number) =>
    invoke<{ deleted: number }>('chat_delete_small_sessions', { minMessages }),

  compact: (sessionId: string) => invoke<void>('chat_compact', { sessionId }),

  setPermissionMode: (sessionId: string, mode: 'default' | 'auto_accept_edits' | 'plan_mode') =>
    invoke<void>('chat_set_permission_mode', { sessionId, mode }),

  allowPermission: (sessionId: string, toolName: string) =>
    invoke<void>('chat_allow_permission', { sessionId, toolName }),

  denyPermission: (sessionId: string, toolName: string) =>
    invoke<void>('chat_deny_permission', { sessionId, toolName }),

  getAllowlist: () => invoke<AllowlistEntry[]>('chat_get_allowlist'),

  removeFromAllowlist: (commands: string[]) =>
    invoke<void>('chat_remove_from_allowlist', { commands }),

  clearAllowlist: () => invoke<void>('chat_clear_allowlist'),

  answerQuestion: (sessionId: string, answer: string) =>
    invoke<void>('chat_answer_question', { sessionId, answer }),
};
