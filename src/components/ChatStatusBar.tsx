import { useAuiState } from '@assistant-ui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type ChatUsage, chatGetUsage } from '../lib/chat';

interface ChatStatusBarProps {
  sessionId: string;
}

export function ChatStatusBar({ sessionId }: ChatStatusBarProps) {
  const { t } = useTranslation();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [usage, setUsage] = useState<ChatUsage | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setUsage(null);
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const u = await chatGetUsage(sessionId);
        if (!cancelled) setUsage(u);
      } catch {
        // silently ignore — status bar should not error loudly
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  if (!sessionId) return null;

  return (
    <div className="border-border text-muted flex items-center gap-3 border-t px-4 py-1 text-xs">
      {/* Context usage */}
      {usage && (
        <>
          <span>
            {t('chat.context')} {usage.context_percent.toFixed(0)}%
          </span>
          <span>·</span>
          <span>
            {t('chat.subscription')} {usage.subscription_percent.toFixed(0)}%
          </span>
          <span>·</span>
        </>
      )}

      {/* Tokens */}
      {usage && usage.input_tokens > 0 && (
        <>
          <span>
            {usage.input_tokens.toLocaleString()} in / {usage.output_tokens.toLocaleString()} {t('chat.tokens')}
          </span>
          <span>·</span>
        </>
      )}

      {/* Cost */}
      {usage && usage.total_cost_usd > 0 && (
        <>
          <span>
            {t('chat.cost')} ${usage.total_cost_usd.toFixed(4)}
          </span>
          <span>·</span>
        </>
      )}

      {/* Streaming indicator */}
      {isRunning && (
        <span className="text-primary animate-pulse">{t('chat.streaming')}</span>
      )}
    </div>
  );
}
