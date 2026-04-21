import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface ChatOutputEvent {
  part_type: string;
  content: string;
  tool_name?: string;
  tool_input?: unknown;
}

function toRunResult(event: ChatOutputEvent): ChatModelRunResult {
  if (event.part_type === 'text') {
    return {
      content: [{ type: 'text', text: event.content }],
    };
  }
  if (event.part_type === 'reasoning') {
    return {
      content: [{ type: 'reasoning', text: event.content }],
    };
  }
  if (event.part_type === 'tool_use') {
    return {
      content: [{
        type: 'tool-call',
        toolCallId: event.tool_name ?? '',
        toolName: event.tool_name ?? '',
        args: (event.tool_input ?? {}) as unknown as Record<string, never>,
        argsText: JSON.stringify(event.tool_input ?? {}),
      }],
    };
  }
  if (event.part_type === 'tool_result') {
    return {
      content: [{ type: 'text', text: `[tool_result: ${event.tool_name}] ${event.content}` }],
    };
  }
  return { content: [{ type: 'text', text: event.content }] };
}

export function createTauriChatModelAdapter(sessionId: string) {
  const adapter: ChatModelAdapter = {
    async *run({ messages, abortSignal, runConfig }) {
      // Use ref object to avoid TypeScript await-narrowing issue with `let` vars
      const resolveRef: { current: ((event: ChatOutputEvent | null) => void) | null } = { current: null };
      const queue: ChatOutputEvent[] = [];
      let unlistenMsg: UnlistenFn | null = null;
      let unlistenState: UnlistenFn | null = null;

      // Start listening BEFORE invoking (so we don't miss events)
      const unlistenMsgPromise: Promise<UnlistenFn> = listen<ChatOutputEvent>('chat-message', (event) => {
        const resolve = resolveRef.current;
        if (resolve) {
          resolve(event.payload);
          resolveRef.current = null;
        } else {
          queue.push(event.payload);
        }
      });

      // Also listen for session state errors
      const unlistenStatePromise: Promise<UnlistenFn> = listen<{ session_id: string; state: string }>('session-state', (event) => {
        if (event.payload.session_id === sessionId && event.payload.state === 'error') {
          const resolve = resolveRef.current;
          if (resolve) resolve(null);
        }
      });

      // Invoke the command — returns immediately, backend streams events
      invoke('chat_send_message', {
        sessionId,
        content: JSON.stringify(messages),
        attachments: null,
        model: (runConfig?.custom as { model?: string } | undefined)?.model ?? null,
      }).catch((e) => {
        const resolve = resolveRef.current;
        if (resolve) {
          resolve({ part_type: 'text', content: String(e) });
        }
      });

      // Wait for listeners to be set up
      unlistenMsg = await unlistenMsgPromise;
      unlistenState = await unlistenStatePromise;

      // Abort controller for cleanup
      const abortController = new AbortController();
      abortSignal?.addEventListener('abort', () => abortController.abort());

      try {
        while (true) {
          if (abortController.signal.aborted) {
            await invoke('chat_cancel', { sessionId }).catch(console.error);
            break;
          }

          // Drain queued events first
          if (queue.length > 0) {
            yield toRunResult(queue.shift()!);
            continue;
          }

          // Wait for next event or abort
          const event = await Promise.race([
            new Promise<ChatOutputEvent | null>((resolve) => {
              resolveRef.current = resolve;
            }),
            new Promise<null>((resolve) => {
              abortController.signal.addEventListener('abort', () => resolve(null), { once: true });
            }),
          ]);

          resolveRef.current = null;

          if (!event) {
            break;
          }
          yield toRunResult(event);
        }
      } finally {
        if (unlistenMsg) unlistenMsg();
        if (unlistenState) unlistenState();
      }
    },
  };
  return adapter;
}
