import { type FC } from 'react';

import { cn } from '../../lib/utils';

export type PermissionMode = 'default' | 'auto_accept_edits' | 'plan_mode';
export type SessionState = 'idle' | 'thinking' | 'request_input' | 'request_permission' | 'error';

interface StatusBarProps {
  contextPct: number;
  subscriptionPct: number;
  gitBranch: string;
  gitDirty: boolean;
  permissionMode: PermissionMode;
  sessionId: string | null;
  onPermissionModeChange?: (sessionId: string, mode: PermissionMode) => void;
}

const modeLabel: Record<PermissionMode, string> = {
  default: 'Default',
  auto_accept_edits: 'Auto',
  plan_mode: 'Plan',
};

const modeBadgeClass: Record<PermissionMode, string> = {
  default: 'bg-muted text-muted-foreground',
  auto_accept_edits: 'bg-green-500/20 text-green-600 dark:text-green-400',
  plan_mode: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
};

const modeOrder: PermissionMode[] = ['default', 'auto_accept_edits', 'plan_mode'];

export const StatusBar: FC<StatusBarProps> = ({
  contextPct,
  subscriptionPct,
  gitBranch,
  gitDirty,
  permissionMode,
  sessionId,
  onPermissionModeChange,
}) => {
  function cycleMode() {
    if (!sessionId || !onPermissionModeChange) return;
    const next = modeOrder[(modeOrder.indexOf(permissionMode) + 1) % modeOrder.length];
    onPermissionModeChange(sessionId, next);
  }

  return (
    <div className="border-border bg-background text-muted-foreground flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs">
      <div className="flex items-center gap-3">
        <span>ctx: {contextPct}%</span>
        <span>sub: {subscriptionPct}%</span>
        {gitBranch && (
          <span>
            git: {gitBranch}
            {gitDirty ? ' ✗' : ' ✓'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cycleMode}
          disabled={!sessionId}
          className={cn(
            'rounded px-1.5 py-0.5 text-xs font-medium transition-opacity',
            modeBadgeClass[permissionMode],
            sessionId ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
          )}
          title="Click to cycle permission mode"
        >
          {modeLabel[permissionMode]}
        </button>
      </div>
    </div>
  );
};
