import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SessionMenu } from './SessionMenu';

type SessionState = 'idle' | 'thinking' | 'request_input' | 'request_permission' | 'error';

interface Session {
  session_id: string;
  name: string;
  state: SessionState;
}

function StateIcon({ state }: { state: SessionState }) {
  if (state === 'idle') return <span className="h-2 w-2 rounded-full bg-gray-400" />;
  if (state === 'thinking') return <span className="animate-pulse h-2 w-2 rounded-full bg-yellow-400" />;
  if (state === 'request_input') return <span className="h-2 w-2 rounded-full bg-yellow-400" />;
  if (state === 'request_permission') return <span className="h-2 w-2 rounded-full bg-blue-400" />;
  if (state === 'error') return <span className="h-2 w-2 rounded-full bg-red-400" />;
  return null;
}

interface SessionListProps {
  activeSessionId: string | null;
  onSelect: (id: string) => void;
}

export function SessionList({ activeSessionId, onSelect }: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Load sessions on mount
  useEffect(() => {
    invoke<Session[]>('chat_list_sessions').then(setSessions).catch(console.error);
  }, []);

  function handleDoubleClick(session: Session) {
    setEditingId(session.session_id);
    setEditName(session.name);
  }

  async function handleRenameBlur(sessionId: string) {
    setEditingId(null);
    const session = sessions.find((s) => s.session_id === sessionId);
    if (session && editName !== session.name) {
      await invoke('chat_rename_session', { sessionId, name: editName });
      setSessions((prev) =>
        prev.map((s) => (s.session_id === sessionId ? { ...s, name: editName } : s)),
      );
    }
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Header with session menu */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-muted-foreground text-sm">Sessions</span>
        <SessionMenu onSessionCreated={(id) => onSelect(id)} />
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <div
            key={s.session_id}
            onClick={() => onSelect(s.session_id)}
            className={`group flex cursor-pointer items-center justify-between px-4 py-3 text-sm ${
              s.session_id === activeSessionId
                ? 'border-primary bg-surface border-l-2'
                : 'border-l-2 border-transparent hover:bg-surface'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <StateIcon state={s.state} />
              {editingId === s.session_id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRenameBlur(s.session_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameBlur(s.session_id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  className="bg-surface text-sm px-1"
                />
              ) : (
                <span onDoubleClick={() => handleDoubleClick(s)} className="truncate cursor-pointer">{s.name}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
