import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
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
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);

  useEffect(() => {
    invoke<RecentSession[]>('chat_get_recent_sessions', { limit: 10 })
      .then(setRecentSessions)
      .catch(console.error);
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
      <DropdownMenu>
        <DropdownMenuTrigger className="text-muted-foreground cursor-pointer p-1 hover:text-foreground">
          +
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="w-64">
          <DropdownMenuLabel className="text-xs">Recent Sessions</DropdownMenuLabel>
          <DropdownMenuGroup>
            {recentSessions.map((s) => (
              <DropdownMenuItem
                key={s.session_id}
                onClick={() => onSessionCreated(s.session_id)}
                className="flex flex-col items-start gap-0.5 py-2"
              >
                <span className="truncate w-full">{s.name}</span>
                <span className="text-muted-foreground text-xs">{formatTime(s.last_used_at)}</span>
              </DropdownMenuItem>
            ))}
            {recentSessions.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => setShowNewSession(true)}
              className="py-2"
            >
              + New session
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

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
