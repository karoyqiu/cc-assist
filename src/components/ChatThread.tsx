import {
  ThreadPrimitive,
  useAui,
} from '@assistant-ui/react';

export function ChatThread() {
  const { thread } = useAui();

  return (
    <ThreadPrimitive.Root>
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-3">
        <ThreadPrimitive.Messages />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}