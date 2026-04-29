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

export const StatusBar: FC<StatusBarProps> = ({
  contextPct,
  subscriptionPct,
  gitBranch,
  gitDirty,
  permissionMode,
}) => {
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
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-xs font-medium',
            modeBadgeClass[permissionMode],
          )}
        >
          {modeLabel[permissionMode]}
        </span>
      </div>
    </div>
  );
};
