// ChatThread - minimal placeholder
// TODO: Wire up assistant-ui v0.12 properly with correct runtime context
import {
  ThreadPrimitive,
} from '@assistant-ui/react';

export function ChatThread() {
  return (
    <ThreadPrimitive.Root>
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-3">
        <div className="text-muted-foreground text-sm">Messages go here</div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}