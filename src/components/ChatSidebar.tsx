import { useEffect, useState } from 'react';

import {
  type LiveSession,
  type StoredSession,
  chatGetSessions,
  chatListStoredSessions,
  onChatSessionsUpdated,
} from '../lib/chat';

type SidebarTab = 'live' | 'history';

interface ChatSidebarProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onCloseSession: (sessionId: string) => void;
}

export function ChatSidebar({
  activeSessionId,
  onSelectSession,
  onNewSession,
  onCloseSession,
}: ChatSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('live');
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadLiveSessions() {
    try {
      const sessions = await chatGetSessions();
      setLiveSessions(sessions);
    } catch (e) {
      console.error('Failed to load live sessions:', e);
    }
  }

  async function loadStoredSessions() {
    setLoading(true);
    try {
      const sessions = await chatListStoredSessions(undefined, 50);
      setStoredSessions(sessions);
    } catch (e) {
      console.error('Failed to load stored sessions:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    loadLiveSessions();
    loadStoredSessions();

    const listenP = onChatSessionsUpdated(() => {
      if (!cancelled) {
        loadLiveSessions();
        loadStoredSessions();
      }
    });

    return () => {
      // Signal the callback to skip state updates after unmount
      cancelled = true;
      listenP.then((fn) => fn());
    };
  }, []);

  // Reload when tab changes
  useEffect(() => {
    if (tab === 'live') {
      loadLiveSessions();
    } else {
      loadStoredSessions();
    }
  }, [tab]);

  function formatTime(lastModified: number): string {
    const date = new Date(lastModified * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="border-border bg-app flex h-full w-56 flex-col border-r">
      {/* Tabs */}
      <div className="border-border flex border-b">
        <button
          className={`flex-1 py-2 text-xs font-medium ${
            tab === 'live' ? 'text-primary border-primary border-b-2' : 'text-muted hover:text-text'
          }`}
          onClick={() => setTab('live')}
        >
          Live
        </button>
        <button
          className={`flex-1 py-2 text-xs font-medium ${
            tab === 'history'
              ? 'text-primary border-primary border-b-2'
              : 'text-muted hover:text-text'
          }`}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      {/* New Session */}
      <button
        className="bg-subtle text-muted hover:bg-hover hover:text-text mx-2 mt-2 flex items-center gap-1.5 rounded px-3 py-2 text-xs"
        onClick={onNewSession}
      >
        <span>+</span> New Session
      </button>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2">
        {tab === 'live' ? (
          liveSessions.length === 0 ? (
            <div className="text-muted px-3 py-4 text-center text-xs">No active sessions</div>
          ) : (
            <ul className="space-y-0.5 px-2">
              {liveSessions.map((session) => (
                <li key={session.id}>
                  <div
                    className={`flex items-center rounded px-2 py-1.5 text-xs ${
                      activeSessionId === session.id
                        ? 'bg-subtle text-text'
                        : 'text-muted hover:bg-subtle hover:text-text'
                    }`}
                  >
                    <button
                      className="flex-1 truncate text-left"
                      onClick={() => onSelectSession(session.id)}
                    >
                      <div className="truncate font-medium">{session.name}</div>
                      <div className="text-muted truncate">{session.directory}</div>
                      <div className="mt-0.5 flex items-center gap-1">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            session.state === 'running'
                              ? 'bg-primary'
                              : session.state === 'waiting_permission' ||
                                  session.state === 'waiting_input'
                                ? 'bg-warning'
                                : 'bg-muted'
                          }`}
                        />
                        <span className="text-muted capitalize">
                          {session.state.replace('_', ' ')}
                        </span>
                      </div>
                    </button>
                    <button
                      className="text-muted hover:text-danger ml-1 shrink-0 rounded px-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseSession(session.id);
                      }}
                      title="Close session"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : loading ? (
          <div className="text-muted px-3 py-4 text-center text-xs">Loading...</div>
        ) : storedSessions.length === 0 ? (
          <div className="text-muted px-3 py-4 text-center text-xs">No stored sessions</div>
        ) : (
          <ul className="space-y-0.5 px-2">
            {storedSessions.map((session) => (
              <li key={session.session_id}>
                <button
                  className="text-muted hover:bg-subtle hover:text-text w-full rounded px-2 py-1.5 text-left text-xs"
                  onClick={() => onSelectSession(session.session_id)}
                >
                  <div className="truncate font-medium">
                    {(session.custom_title ?? session.summary.slice(0, 40)) || 'Untitled'}
                  </div>
                  {session.cwd && <div className="text-muted truncate">{session.cwd}</div>}
                  <div className="text-muted mt-0.5">{formatTime(session.last_modified)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
