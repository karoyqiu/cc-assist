import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';

import { listen } from '@tauri-apps/api/event';

import { chatCommands } from './chatCommands';

interface ChatOutputPayload {
  sessionId: string;
  content: string;
  partType: 'text' | 'reasoning' | 'tool_call';
}

interface ResultPayload {
  sessionId: string;
  usage: { contextTokens: number; outputTokens: number } | null;
}

export function createTauriChatModelAdapter(sessionId: string): ChatModelAdapter {
  return {
    async *run({
      messages,
      abortSignal,
    }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (!lastUser) return;

      const textPart = lastUser.content.find((p) => p.type === 'text');
      const content = textPart?.type === 'text' ? textPart.text : '';

      let resolve: (() => void) | null = null;
      const chunks: string[] = [];

      const unlistenOutput = await listen<ChatOutputPayload>('chat-output', (event) => {
        if (event.payload.sessionId !== sessionId) return;
        if (event.payload.partType === 'text') {
          chunks.push(event.payload.content);
          resolve?.();
        }
      });

      const unlistenResult = await listen<ResultPayload>('result', (event) => {
        if (event.payload.sessionId !== sessionId) return;
        chunks.push('\x00DONE');
        resolve?.();
      });

      abortSignal.addEventListener('abort', () => {
        chunks.push('\x00ABORT');
        resolve?.();
      });

      await chatCommands.sendMessage(sessionId, content);

      let accumulated = '';
      try {
        while (true) {
          if (chunks.length === 0) {
            await new Promise<void>((r) => {
              resolve = r;
            });
            resolve = null;
          }
          const chunk = chunks.shift();
          if (!chunk) continue;
          if (chunk === '\x00DONE' || chunk === '\x00ABORT') break;
          accumulated += chunk;
          yield {
            content: [{ type: 'text', text: accumulated }],
          };
        }
      } finally {
        unlistenOutput();
        unlistenResult();
      }
    },
  };
}
