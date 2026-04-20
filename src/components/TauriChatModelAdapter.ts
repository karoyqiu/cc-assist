import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react';
import { invoke, type Channel } from '@tauri-apps/api/core';

interface ChatOutputEvent {
  part_type: string;  // "text", "tool_use", "tool_result", "thinking"
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
  // tool_result is not a standard ThreadAssistantMessagePart - emit as text
  if (event.part_type === 'tool_result') {
    return {
      content: [{ type: 'text', text: `[tool_result: ${event.tool_name}] ${event.content}` }],
    };
  }
  return { content: [{ type: 'text', text: event.content }] };
}

export function createTauriChatModelAdapter(sessionId: string) {
  const adapter: ChatModelAdapter = {
    async *run({ messages, abortSignal }) {
      // Promise-based message queue
      let pendingResolve: ((event: ChatOutputEvent) => void) | null = null;
      const queue: ChatOutputEvent[] = [];

      // invoke() returns a Channel — stream events directly from it
      const channel = await invoke<Channel<ChatOutputEvent>>('chat_send_message', {
        sessionId,
        content: JSON.stringify(messages),
        attachments: null,
        model: null,
      });

      // Set up the channel handler once — each message gets resolved from the queue
      channel.onmessage = (event: ChatOutputEvent) => {
        if (pendingResolve) {
          pendingResolve(event);
          pendingResolve = null;
        } else {
          queue.push(event);
        }
      };

      // Abort controller for cleanup
      const abortController = new AbortController();
      abortSignal?.addEventListener('abort', () => abortController.abort());

      try {
        while (true) {
          if (abortController.signal.aborted) {
            await invoke('chat_cancel', { sessionId }).catch(console.error);
            channel.onmessage = null as unknown as (response: ChatOutputEvent) => void;
            break;
          }

          // Drain queued events first
          if (queue.length > 0) {
            yield toRunResult(queue.shift()!);
            continue;
          }

          // Wait for next event from channel
          const event = await new Promise<ChatOutputEvent | null>((resolve) => {
            pendingResolve = resolve;
            // Timeout to check abort
            setTimeout(() => {
              if (abortController.signal.aborted) {
                resolve(null);
              }
            }, 100);
          });

          if (!event) break; // channel closed or aborted
          yield toRunResult(event);
        }
      } finally {
        channel.onmessage = null as unknown as (response: ChatOutputEvent) => void;
      }
    },
  };
  return adapter;
}
