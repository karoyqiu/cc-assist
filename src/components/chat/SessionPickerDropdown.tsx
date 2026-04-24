import { useEffect, useState, type FC } from 'react';

import { chatCommands, type RecentSessionInfo } from '../../lib/chatCommands';

interface SessionPickerDropdownProps {
  open: boolean;
  onClose: () => void;
  onSelectRecent: (session: RecentSessionInfo) => void;
  onSelectNew: () => void;
}

export const SessionPickerDropdown: FC<SessionPickerDropdownProps> = ({
  open,
  onClose,
  onSelectRecent,
  onSelectNew,
}) => {
  const [sessions, setSessions] = useState<RecentSessionInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    chatCommands.listRecentSessions().then(setSessions).catch(console.error);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="border-border bg-card absolute top-10 left-2 z-50 w-56 rounded-lg border shadow-lg">
        <div className="py-1">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              type="button"
              onClick={() => {
                onSelectRecent(s);
                onClose();
              }}
              className="hover:bg-muted flex w-full flex-col px-3 py-2 text-left"
            >
              <span className="text-foreground truncate text-sm">{s.title}</span>
              <span className="text-muted-foreground truncate text-xs">{s.cwd}</span>
            </button>
          ))}
          {sessions.length > 0 && <div className="border-border my-1 border-t" />}
          <button
            type="button"
            onClick={() => {
              onSelectNew();
              onClose();
            }}
            className="hover:bg-muted text-foreground flex w-full items-center gap-2 px-3 py-2 text-sm"
          >
            <span className="text-base leading-none">+</span>
            New Session
          </button>
        </div>
      </div>
    </>
  );
};
