import { type FC, useState } from 'react';

export interface PermissionRequestPayload {
  sessionId: string;
  toolName: string;
  command: string;
}

interface PermissionRequestCardProps {
  payload: PermissionRequestPayload;
  onAllow: (sessionId: string, toolName: string) => void;
  onAllowAlways: (sessionId: string, toolName: string) => void;
  onDeny: (sessionId: string, toolName: string) => void;
}

export const PermissionRequestCard: FC<PermissionRequestCardProps> = ({
  payload,
  onAllow,
  onAllowAlways,
  onDeny,
}) => {
  const [resolved, setResolved] = useState<'allowed' | 'denied' | null>(null);

  function handle(action: 'allow' | 'allow-always' | 'deny') {
    if (action === 'allow') {
      onAllow(payload.sessionId, payload.toolName);
      setResolved('allowed');
    } else if (action === 'allow-always') {
      onAllowAlways(payload.sessionId, payload.toolName);
      setResolved('allowed');
    } else {
      onDeny(payload.sessionId, payload.toolName);
      setResolved('denied');
    }
  }

  return (
    <div className="border-border bg-card mx-auto my-2 w-full max-w-3xl rounded-xl border p-4">
      <div className="text-foreground mb-3 flex items-center gap-2 text-sm font-medium">
        <span>🛡</span>
        <span>Permission Request</span>
      </div>
      <p className="text-muted-foreground mb-4 font-mono text-xs">{payload.command}</p>
      {resolved ? (
        <p className="text-muted-foreground text-xs capitalize">{resolved}</p>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="permission-deny"
            onClick={() => handle('deny')}
            className="border-destructive text-destructive hover:bg-destructive/10 rounded-md border px-3 py-1.5 text-xs transition"
          >
            Deny
          </button>
          <button
            type="button"
            data-testid="permission-allow"
            onClick={() => handle('allow')}
            className="border-border bg-muted text-foreground hover:bg-muted/80 rounded-md border px-3 py-1.5 text-xs transition"
          >
            Allow
          </button>
          <button
            type="button"
            data-testid="permission-allow-always"
            onClick={() => handle('allow-always')}
            className="border-border bg-muted text-foreground hover:bg-muted/80 rounded-md border px-3 py-1.5 text-xs transition"
          >
            Allow always
          </button>
        </div>
      )}
    </div>
  );
};
