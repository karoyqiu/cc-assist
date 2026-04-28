import type { FC } from 'react';

import type { RecentSessionInfo, SessionInfo } from '../../lib/chatCommands';
import type { ProfileConfig } from '../../types';

import { SessionPickerDropdown } from './SessionPickerDropdown';

interface SessionListProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onClose: (sessionId: string) => void;
  onOpenSettings: () => void;
  onResumeSession: (session: RecentSessionInfo) => void;
  profiles: ProfileConfig[];
  recentSessions: RecentSessionInfo[];
}

const stateIndicator: Record<SessionInfo['state'], string> = {
  idle: '●',
  thinking: '⋯',
  request_input: '◐',
  request_permission: '🛡',
  error: '✕',
};

const stateColor: Record<SessionInfo['state'], string> = {
  idle: 'text-muted-foreground',
  thinking: 'text-foreground animate-pulse',
  request_input: 'text-warning',
  request_permission: 'text-info',
  error: 'text-destructive',
};

function basename(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}

export const SessionList: FC<SessionListProps> = ({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onClose,
  onOpenSettings,
  onResumeSession,
  profiles,
  recentSessions,
}) => {
  const profileName = (profileId: string) =>
    profiles.find((p) => p.id === profileId)?.name ?? profileId;

  return (
    <div className="border-border bg-background flex w-56 shrink-0 flex-col border-r">
      <div className="border-border flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Sessions
        </span>
        <SessionPickerDropdown
          sessions={recentSessions}
          onSelectRecent={onResumeSession}
          onSelectNew={onNew}
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.map((s) => (
          <div key={s.sessionId} className="group relative">
            <button
              type="button"
              data-testid={`session-item-${s.sessionId}`}
              onClick={() => onSelect(s.sessionId)}
              className={`hover:bg-muted flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm transition ${
                s.sessionId === activeSessionId
                  ? 'bg-muted border-primary border-l-2'
                  : 'border-l-2 border-transparent'
              }`}
            >
              <span className={`shrink-0 text-xs ${stateColor[s.state]}`}>
                {stateIndicator[s.state]}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-foreground truncate text-sm">{s.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {basename(s.cwd)} · {profileName(s.profileId)}
                </span>
              </div>
            </button>
            <button
              type="button"
              data-testid={`session-close-${s.sessionId}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(s.sessionId);
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 hidden h-4 w-4 shrink-0 -translate-y-1/2 items-center justify-center rounded group-hover:flex"
              aria-label="Close session"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="border-border border-t p-2">
        <button
          type="button"
          data-testid="settings-button"
          onClick={onOpenSettings}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center justify-center rounded-md py-1.5 text-xs transition"
          aria-label="Settings"
        >
          ⚙ Settings
        </button>
      </div>
    </div>
  );
};
