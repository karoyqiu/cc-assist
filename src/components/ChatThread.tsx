// ChatThread - minimal placeholder
// TODO: Wire up assistant-ui v0.12 properly with correct runtime context
import { ThreadPrimitive, ChainOfThoughtPrimitive } from '@assistant-ui/react';

export function ChatThread() {
  return (
    <ThreadPrimitive.Root>
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-3">
        <ThreadPrimitive.Messages>
          {() => (
            <ChainOfThoughtPrimitive.Root>
              <ChainOfThoughtPrimitive.Parts
                components={{
                  Layout: ({ children }) => (
                    <div className="border-subtle my-2 border-t">{children}</div>
                  ),
                  Reasoning: ({ text }) => (
                    <div className="px-4 py-2">
                      <span className="text-muted-foreground text-sm italic">{text}</span>
                    </div>
                  ),
                }}
              />
            </ChainOfThoughtPrimitive.Root>
          )}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
