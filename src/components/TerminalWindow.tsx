import { listen } from '@tauri-apps/api/event';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '@xterm/xterm/css/xterm.css';
import type { Session } from '@/lib/terminal';
import type { RecentDirectories } from '@/types';
import type { ProfileConfig } from '@/types';

import { DirectoryCombobox } from '@/components/DirectoryCombobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  startOutputListener,
  stopOutputListener,
  createSession,
  writeToSession,
  resizeSession,
  closeSession,
  getSessions,
  getActiveSessionId,
  setActiveSessionId,
  addSession,
  removeSession,
  registerSessionWriter,
  unregisterSessionWriter,
  getFontSettings,
  getExitedSessionId,
  setExitedSessionId,
  listSessions,
} from '@/lib/terminal';

interface SessionTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
}

interface TerminalWindowProps {
  profiles: ProfileConfig[];
  activeProfileId: string;
  activeProfileColor: string;
  recentDirectories: RecentDirectories;
  onOpenSettings: () => void;
}

export function TerminalWindow({
  profiles,
  activeProfileId,
  activeProfileColor,
  recentDirectories,
  onOpenSettings,
}: TerminalWindowProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const terminalsRef = useRef<Map<string, SessionTerminal>>(new Map());
  const [newSessionDir, setNewSessionDir] = useState(recentDirectories[0] ?? '');
  const [newSessionProfileId, setNewSessionProfileId] = useState(activeProfileId);
  const { t } = useTranslation();

  // Sync sessions state from module
  const syncSessions = useCallback(() => {
    setSessions(getSessions());
    setActiveId(getActiveSessionId());
  }, []);

  // Create a terminal instance for a session
  function createTerminalForSession(sessionId: string) {
    if (!panelRef.current) return;
    if (terminalsRef.current.has(sessionId)) return;

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

    const container = document.createElement('div');
    container.className = 'absolute inset-0 overflow-hidden px-2 py-2';
    container.style.display = 'none';
    panelRef.current.appendChild(container);

    term.open(container);

    // Register output writer — PTY output for this session writes to this terminal
    registerSessionWriter(sessionId, (data: string) => {
      term.write(data);
    });

    // Handle input — send keystrokes to Rust for this specific session
    term.onData((data) => {
      if (getExitedSessionId() === sessionId) {
        setExitedSessionId(null);
        closeSession(sessionId).catch(console.error);
        removeSession(sessionId);
        disposeTerminal(sessionId);
        syncSessions();
        return;
      }
      writeToSession(sessionId, data).catch(console.error);
    });

    terminalsRef.current.set(sessionId, { terminal: term, fitAddon, container });
  }

  // Dispose a session's terminal instance
  function disposeTerminal(sessionId: string) {
    const st = terminalsRef.current.get(sessionId);
    if (st) {
      unregisterSessionWriter(sessionId);
      st.terminal.dispose();
      st.container.remove();
      terminalsRef.current.delete(sessionId);
    }
  }

  // Show the terminal for the active session, hide all others
  function showTerminal(sessionId: string | null) {
    for (const [id, st] of terminalsRef.current) {
      st.container.style.display = id === sessionId ? 'block' : 'none';
    }
    if (sessionId) {
      const st = terminalsRef.current.get(sessionId);
      if (st) {
        requestAnimationFrame(() => {
          st.fitAddon.fit();
          const dims = st.fitAddon.proposeDimensions();
          if (dims) {
            resizeSession(sessionId, dims.cols, dims.rows).catch(console.error);
          }
        });
      }
    }
  }

  // Init: start output listener, discover existing sessions
  useEffect(() => {
    startOutputListener();

    const exitUnlisten = listen<string>('session-exited', (event) => {
      const id = event.payload;
      setExitedSessionId(id);
      const st = terminalsRef.current.get(id);
      if (st) {
        st.terminal.write(`\r\n\x1b[90m${t('terminal.pressAnyKeyToClose')}\x1b[0m `);
      }
    });

    listSessions()
      .then((existing) => {
        for (const s of existing) {
          addSession(s);
          createTerminalForSession(s.id);
        }
        if (existing.length > 0 && !getActiveSessionId()) {
          setActiveSessionId(existing[0].id);
        }
        syncSessions();
      })
      .catch(console.error);

    const terminals = terminalsRef.current;
    return () => {
      stopOutputListener();
      exitUnlisten.then((fn) => fn());
      for (const st of terminals.values()) {
        st.terminal.dispose();
      }
      terminals.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show/hide terminals when activeId changes
  useEffect(() => {
    showTerminal(activeId);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (activeId) {
        const st = terminalsRef.current.get(activeId);
        if (st) {
          st.fitAddon.fit();
          const dims = st.fitAddon.proposeDimensions();
          if (dims) {
            resizeSession(activeId, dims.cols, dims.rows).catch(console.error);
          }
        }
      }
    };

    const observer = new ResizeObserver(handleResize);
    if (panelRef.current) {
      observer.observe(panelRef.current);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
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

      createTerminalForSession(result.session_id);
      showTerminal(result.session_id);

      setTimeout(() => {
        const st = terminalsRef.current.get(result.session_id);
        if (st) {
          st.fitAddon.fit();
          const dims = st.fitAddon.proposeDimensions();
          if (dims) {
            resizeSession(result.session_id, dims.cols, dims.rows).catch(console.error);
          }
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
  }

  async function handleCloseSession(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await closeSession(id);
      removeSession(id);
      disposeTerminal(id);
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
          <span className="text-muted text-sm">{t('terminal.sessions')}</span>
          <button
            onClick={() => setShowNewSession(true)}
            className="text-muted hover:bg-surface hover:text-text flex h-7 w-7 items-center justify-center rounded"
            title={t('terminal.newSession')}
          >
            +
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-muted px-4 py-8 text-center text-sm">
              <div>{t('terminal.noSessions')}</div>
              <div className="mt-1 text-xs">{t('terminal.noSessionsHint')}</div>
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
                  title={t('terminal.closeSession')}
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
            ⚙ {t('tray.settings')}
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
            <Select value={newSessionProfileId} onValueChange={setNewSessionProfileId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('terminal.profileId')} />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DirectoryCombobox
              directories={recentDirectories}
              value={newSessionDir}
              onChange={setNewSessionDir}
            />
            <div className="flex gap-2">
              <button
                onClick={handleNewSession}
                className="bg-accent rounded px-3 py-1 text-sm text-white hover:opacity-90"
              >
                {t('terminal.start')}
              </button>
              <button
                onClick={() => setShowNewSession(false)}
                className="bg-surface text-muted hover:bg-border hover:text-text rounded px-3 py-1 text-sm"
              >
                {t('terminal.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Terminal container — holds per-session xterm instances */}
        <div
          ref={panelRef}
          className="bg-app relative flex-1 overflow-hidden"
          style={{ display: activeId ? 'block' : 'none' }}
        />

        {/* Empty state */}
        {!activeId && !showNewSession && (
          <div className="text-muted flex flex-1 items-center justify-center text-sm">
            {t('terminal.selectSession')}
          </div>
        )}
      </div>
    </div>
  );
}
