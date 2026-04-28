import type { FC } from 'react';

import type { RecentSessionInfo } from '../../lib/chatCommands';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface SessionPickerDropdownProps {
  sessions: RecentSessionInfo[];
  onSelectRecent: (session: RecentSessionInfo) => void;
  onSelectNew: () => void;
}

export const SessionPickerDropdown: FC<SessionPickerDropdownProps> = ({
  sessions,
  onSelectRecent,
  onSelectNew,
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      data-testid="session-picker-trigger"
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-6 w-6 items-center justify-center rounded text-base leading-none"
      aria-label="New session"
    >
      +
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {sessions.map((s) => (
        <DropdownMenuItem
          key={s.sessionId}
          data-testid={`session-recent-${s.sessionId}`}
          onClick={() => onSelectRecent(s)}
        >
          <div className="flex flex-col">
            <span className="truncate text-sm">{s.title}</span>
            <span className="text-muted-foreground truncate text-xs">
              {s.cwd.split(/[\\/]/).pop() ?? s.cwd}
            </span>
          </div>
        </DropdownMenuItem>
      ))}
      {sessions.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem data-testid="session-new" onClick={onSelectNew}>
        <span className="text-base leading-none">+</span>
        New Session
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
