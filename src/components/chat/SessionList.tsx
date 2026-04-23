import { type FC } from 'react';

import type { SessionInfo } from '../../lib/chatCommands';

interface SessionListProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onClose: (sessionId: string) => void;
  onOpenSettings: () => void;
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
  request_input: 'text-yellow-500',
  request_permission: 'text-blue-500',
  error: 'text-destructive',
};

export const SessionList: FC<SessionListProps> = ({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onClose,
  onOpenSettings,
}) => {
  return (
    <div className="border-border bg-background flex w-56 shrink-0 flex-col border-r">
      <div className="border-border flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Sessions
        </span>
        <button
          type="button"
          onClick={onNew}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-6 w-6 items-center justify-center rounded text-base leading-none"
          aria-label="New session"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.map((s) => (
          <div
            key={s.sessionId}
            className={`group hover:bg-muted relative flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition ${
              s.sessionId === activeSessionId ? 'border-primary bg-muted border-l-2' : ''
            }`}
            onClick={() => {
              onSelect(s.sessionId);
            }}
          >
            <span className={`shrink-0 text-xs ${stateColor[s.state]}`}>
              {stateIndicator[s.state]}
            </span>
            <span className="text-foreground flex-1 truncate">{s.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(s.sessionId);
              }}
              className="text-muted-foreground hover:text-foreground hidden h-4 w-4 shrink-0 items-center justify-center rounded group-hover:flex"
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
