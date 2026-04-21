import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { PermissionBadge } from './PermissionBadge';

interface StatusBarProps {
  sessionId: string;
}

type SessionState = 'idle' | 'thinking' | 'request_input' | 'request_permission' | 'error';

export function StatusBar({ sessionId }: StatusBarProps) {
  const [contextPct, setContextPct] = useState(0);
  const [subscriptionPct, setSubscriptionPct] = useState(0);
  const [gitBranch, setGitBranch] = useState('');
  const [gitDirty, setGitDirty] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [permissionMode, setPermissionMode] = useState('default');

  // Load token usage
  useEffect(() => {
    invoke<{ context_pct: number; subscription_pct: number }>('chat_get_token_usage', { sessionId })
      .then((r) => {
        setContextPct(r.context_pct);
        setSubscriptionPct(r.subscription_pct);
      })
      .catch(console.error);
  }, [sessionId]);

  // Listen for result events (token usage)
  useEffect(() => {
    const unlisten = listen<{ session_id: string; usage?: { context_pct?: number; subscription_pct?: number } }>(
      'result',
      (event) => {
        if (event.payload.session_id !== sessionId) return;
        if (event.payload.usage) {
          setContextPct(event.payload.usage.context_pct ?? 0);
          setSubscriptionPct(event.payload.usage.subscription_pct ?? 0);
        }
      },
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [sessionId]);

  // Listen for session state changes
  useEffect(() => {
    const unlisten = listen<{ session_id: string; state: SessionState }>(
      'session-state',
      (event) => {
        if (event.payload.session_id !== sessionId) return;
        setSessionState(event.payload.state);
      },
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [sessionId]);

  // Listen for permission mode changes
  useEffect(() => {
    const unlisten = listen<{ session_id: string; mode: string }>(
      'permission-mode',
      (event) => {
        if (event.payload.session_id !== sessionId) return;
        setPermissionMode(event.payload.mode);
      },
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [sessionId]);

  // Poll git status
  useEffect(() => {
    const poll = () => {
      invoke<{ branch: string; dirty: boolean }>('chat_git_status')
        .then((r) => {
          setGitBranch(r.branch);
          setGitDirty(r.dirty);
        })
        .catch(console.error);
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-7 items-center justify-between border-t px-4 text-xs">
      {/* Left: metrics */}
      <div className="flex items-center gap-3 text-muted-foreground">
        <span>ctx: {contextPct}%</span>
        <span>sub: {subscriptionPct}%</span>
        <span>
          git: {gitBranch}
          {gitDirty && ' *'}
        </span>
      </div>

      {/* Right: permission + state */}
      <div className="flex items-center gap-2">
        <PermissionBadge mode={permissionMode} />
        <span className="text-muted-foreground capitalize">{sessionState.replace('_', ' ')}</span>
      </div>
    </div>
  );
}