import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';
import type { Session } from '@/lib/terminal';
import type { ProfileConfig } from '@/types';

import {
  startOutputPolling,
  stopOutputPolling,
  createSession,
  writeToSession,
  resizeSession,
  closeSession,
  getSessions,
  getActiveSessionId,
  setActiveSessionId,
  addSession,
  removeSession,
  setActiveWriteFn,
  getFontSettings,
  listSessions,
} from '@/lib/terminal';

interface TerminalWindowProps {
  profiles: ProfileConfig[];
  activeProfileId: string;
  activeProfileColor: string;
  lastDirectory: string;
  onOpenSettings: () => void;
}

export function TerminalWindow({
  profiles,
  activeProfileId,
  activeProfileColor,
  lastDirectory,
  onOpenSettings,
}: TerminalWindowProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);
  const [newSessionDir, setNewSessionDir] = useState(lastDirectory);
  const [newSessionProfileId, setNewSessionProfileId] = useState(activeProfileId);

  // Init xterm
  useEffect(() => {
    if (!terminalRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const fontSettings = getFontSettings();
    const term = new Terminal({
      fontFamily: fontSettings.fontFamily,
      fontSize: fontSettings.fontSize,
      theme: {
        background: '#0F0F0F',
        foreground: '#E5E5E5',
        cursor: '#E5E5E5',
        selectionBackground: '#2A2A2A',
      },
      cursorBlink: true,
      cursorStyle: 'block',
    });

    const fitAddon = new FitAddon();
    const clipboardAddon = new ClipboardAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(clipboardAddon);
    term.open(terminalRef.current);

    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Set up output writer — polling calls this with PTY data
    setActiveWriteFn((data: string) => {
      term.write(data);
    });

    // Set up input handler — send keystrokes to Rust
    // Use getActiveSessionId() to read module-level state at call time,
    // avoiding stale closure over React state.
    term.onData((data) => {
      const id = getActiveSessionId();
      if (id) {
        writeToSession(id, data).catch(console.error);
      }
    });

    // Start polling PTY output
    startOutputPolling();

    return () => {
      stopOutputPolling();
      setActiveWriteFn(() => {});
      term.dispose();
      initializedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync sessions state from module
  const syncSessions = useCallback(() => {
    setSessions(getSessions());
    setActiveId(getActiveSessionId());
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && activeId) {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          resizeSession(activeId, dims.cols, dims.rows).catch(console.error);
        }
      }
    };

    const observer = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      observer.observe(terminalRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [activeId]);

  // Discover existing sessions from Rust backend on mount.
  // This handles the case where launch_terminal (tray/settings) created
  // a session before the terminal window's frontend loaded.
  useEffect(() => {
    listSessions()
      .then((existing) => {
        for (const s of existing) {
          addSession(s);
        }
        // Set the first discovered session as active
        if (existing.length > 0 && !getActiveSessionId()) {
          setActiveSessionId(existing[0].id);
        }
        syncSessions();
      })
      .catch(console.error);
  }, [syncSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear xterm when active session changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, [activeId]);

  async function handleNewSession() {
    if (!newSessionProfileId) return;
    try {
      const result = await createSession(newSessionProfileId, newSessionDir);
      addSession({ id: result.session_id, name: result.name });
      setActiveSessionId(result.session_id);
      setActiveId(result.session_id);
      setShowNewSession(false);
      syncSessions();

      // Fit and resize after a short delay
      setTimeout(() => {
        fitAddonRef.current?.fit();
        const dims = fitAddonRef.current?.proposeDimensions();
        if (dims) {
          resizeSession(result.session_id, dims.cols, dims.rows).catch(console.error);
        }
      }, 50);
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  }

  function handleSelectSession(id: string) {
    setActiveSessionId(id);
    setActiveId(id);
    syncSessions();
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }

  async function handleCloseSession(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await closeSession(id);
      removeSession(id);
      syncSessions();
    } catch (e) {
      console.error('Failed to close session:', e);
    }
  }

  const activeSession = sessions.find((s) => s.id === activeId);

  return (
    <div className="bg-app flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <div className="border-border flex w-60 flex-col border-r">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-muted text-sm">Sessions</span>
          <button
            onClick={() => setShowNewSession(true)}
            className="text-muted hover:bg-surface hover:text-text flex h-7 w-7 items-center justify-center rounded"
            title="New Session"
          >
            +
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-muted px-4 py-8 text-center text-sm">
              <div>No sessions</div>
              <div className="mt-1 text-xs">Click + to start a new session</div>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSelectSession(session.id)}
                className={`group flex cursor-pointer items-center justify-between px-4 py-5 text-sm ${
                  session.id === activeId ? 'bg-surface' : 'hover:bg-surface'
                }`}
                style={
                  session.id === activeId
                    ? { borderLeft: `2px solid ${activeProfileColor}` }
                    : { borderLeft: '2px solid transparent' }
                }
              >
                <span className="truncate">{session.name}</span>
                <button
                  onClick={(e) => handleCloseSession(e, session.id)}
                  className="text-muted hover:text-text hidden group-hover:block"
                  title="Close session"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        {/* Bottom bar */}
        <div className="border-border border-t p-2">
          <button
            onClick={onOpenSettings}
            className="text-muted hover:bg-surface hover:text-text flex w-full items-center justify-center gap-2 rounded px-3 py-2 text-sm"
          >
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* Terminal panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Active session header */}
        {activeSession && (
          <div className="border-border bg-surface flex h-6 items-center border-b px-3">
            <span className="text-muted truncate font-mono text-xs">{activeSession.name}</span>
          </div>
        )}

        {/* New session form */}
        {showNewSession && (
          <div className="border-border bg-surface flex flex-col gap-2 border-b p-3">
            <select
              value={newSessionProfileId}
              onChange={(e) => {
                setNewSessionProfileId(e.target.value);
              }}
              className="border-border bg-app text-text flex-1 rounded border px-2 py-1 text-sm"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSessionDir}
                onChange={(e) => setNewSessionDir(e.target.value)}
                placeholder="Directory"
                className="border-border bg-app text-text placeholder:text-muted flex-1 rounded border px-2 py-1 font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleNewSession}
                className="bg-accent rounded px-3 py-1 text-sm text-white hover:opacity-90"
              >
                Start
              </button>
              <button
                onClick={() => setShowNewSession(false)}
                className="bg-surface text-muted hover:bg-border hover:text-text rounded px-3 py-1 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Terminal */}
        <div
          ref={terminalRef}
          className="bg-app flex-1 overflow-hidden px-2 py-2"
          style={{ display: activeId ? 'flex' : 'none' }}
        />

        {/* Empty state */}
        {!activeId && !showNewSession && (
          <div className="text-muted flex flex-1 items-center justify-center text-sm">
            Select a session to begin
          </div>
        )}
      </div>
    </div>
  );
}
