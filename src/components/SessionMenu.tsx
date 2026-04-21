import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { NewSessionDialog } from './NewSessionDialog';

interface RecentSession {
  session_id: string;
  name: string;
  last_used_at: string;
}

interface SessionMenuProps {
  onSessionCreated: (id: string) => void;
}

export function SessionMenu({ onSessionCreated }: SessionMenuProps) {
  const [open, setOpen] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      invoke<RecentSession[]>('chat_get_recent_sessions', { limit: 10 })
        .then(setRecentSessions)
        .catch(console.error);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function formatTime(iso: string) {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const min = Math.floor(diff / 60000);
      if (min < 60) return `${min}m ago`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr}h ago`;
      return new Date(iso).toLocaleDateString();
    } catch {
      return '';
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="text-muted-foreground cursor-pointer p-1 hover:text-foreground"
      >
        +
      </button>

      {open && (
        <div ref={menuRef} className="absolute left-0 top-full z-50 mt-1 w-64 rounded border bg-surface shadow-lg">
          <div className="border-b p-2 text-xs text-muted-foreground">Recent Sessions</div>
          {recentSessions.map((s) => (
            <button
              key={s.session_id}
              onClick={() => {
                onSessionCreated(s.session_id);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left text-sm hover:bg-subtle"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate">{s.name}</div>
                <div className="text-muted-foreground text-xs">{formatTime(s.last_used_at)}</div>
              </div>
            </button>
          ))}

          <div className="border-t" />
          <button
            onClick={() => {
              setShowNewSession(true);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-subtle"
          >
            + New session
          </button>
        </div>
      )}

      <NewSessionDialog
        open={showNewSession}
        onClose={() => setShowNewSession(false)}
        onCreated={(id) => {
          setShowNewSession(false);
          onSessionCreated(id);
        }}
      />
    </>
  );
}
