import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

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
let activeWrite: ((data: string) => void) | null = null;
let unlisten: UnlistenFn | null = null;

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

let listenGen = 0;

/// Start listening for terminal output events from the Rust backend.
export async function startOutputListener() {
  // Stop any existing listener
  if (unlisten) {
    unlisten();
    unlisten = null;
  }

  const myGen = ++listenGen;
  const fn = await listen<{ session_id: string; data: string }>('terminal-output', (event) => {
    // Ignore events from stale listeners
    if (myGen !== listenGen) return;
    if (event.payload.session_id === activeSessionId && activeWrite) {
      activeWrite(event.payload.data);
    }
  });

  // If a newer listener was started while we were awaiting, discard this one
  if (myGen !== listenGen) {
    fn();
    return;
  }
  unlisten = fn;
}

/// Stop listening for terminal output events.
export function stopOutputListener() {
  listenGen++; // invalidate any pending or active listener
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
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

export async function listSessions(): Promise<Session[]> {
  const result = await invoke<{ session_id: string; name: string }[]>('terminal_list_sessions');
  return result.map((s) => ({ id: s.session_id, name: s.name }));
}

export async function launchTerminal(): Promise<void> {
  await invoke('launch_terminal');
}
