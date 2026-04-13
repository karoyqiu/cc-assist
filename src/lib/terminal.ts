import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface Session {
  id: string;
  name: string;
}

export interface CreateSessionResult {
  session_id: string;
  name: string;
}

export interface TerminalFontSettings {
  fontFamily: string;
  fontSize: number;
}

const DEFAULT_FONT: TerminalFontSettings = {
  fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
  fontSize: 14,
};

let sessions: Session[] = [];
let activeSessionId: string | null = null;
let fontSettings: TerminalFontSettings = { ...DEFAULT_FONT };
let outputListener: Promise<UnlistenFn> | null = null;
let activeWrite: ((data: string) => void) | null = null;

export function setActiveWriteFn(fn: (data: string) => void) {
  activeWrite = fn;
}

export function getFontSettings(): TerminalFontSettings {
  return { ...fontSettings };
}

export function setFontSettings(settings: TerminalFontSettings) {
  fontSettings = settings;
}

export function getSessions(): Session[] {
  return [...sessions];
}

export function getActiveSessionId(): string | null {
  return activeSessionId;
}

export function setActiveSessionId(id: string | null) {
  activeSessionId = id;
}

export function addSession(session: Session) {
  sessions = [...sessions, session];
}

export function removeSession(id: string) {
  sessions = sessions.filter((s) => s.id !== id);
  if (activeSessionId === id) {
    activeSessionId = sessions[0]?.id ?? null;
  }
}

export function initOutputListener() {
  if (outputListener) return;
  outputListener = listen<{ session_id: string; data: string }>('terminal-output', (event) => {
    if (activeWrite && event.payload.session_id === activeSessionId) {
      activeWrite(event.payload.data);
    }
  });
}

export async function cleanupOutputListener() {
  if (outputListener) {
    const unlisten = await outputListener;
    unlisten();
  }
  outputListener = null;
  activeWrite = null;
}

export async function createSession(
  profileId: string,
  directory: string,
): Promise<CreateSessionResult> {
  const result = await invoke<CreateSessionResult>('terminal_create_session', {
    profileId,
    directory,
  });
  return result;
}

export async function writeToSession(sessionId: string, data: string): Promise<void> {
  await invoke('terminal_write', { sessionId, data });
}

export async function resizeSession(sessionId: string, cols: number, rows: number): Promise<void> {
  await invoke('terminal_resize', { sessionId, cols, rows });
}

export async function closeSession(sessionId: string): Promise<void> {
  await invoke('terminal_close_session', { sessionId });
}
