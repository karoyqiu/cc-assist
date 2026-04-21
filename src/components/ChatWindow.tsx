import { useMemo, useState } from 'react';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
} from '@assistant-ui/react';
import { ChatComposer } from './ChatComposer';
import { StatusBar } from './StatusBar';
import { SessionList } from './SessionList';
import { createTauriChatModelAdapter } from './TauriChatModelAdapter';

function ChatPanel({ sessionId }: { sessionId: string }) {
  const adapter = useMemo(() => createTauriChatModelAdapter(sessionId), [sessionId]);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ThreadPrimitive.Root>
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-3">
              <ThreadPrimitive.Messages>
                {({ message }) => (
                  <div className="text-sm">
                    [{message.role}] {JSON.stringify(message).slice(0, 100)}
                  </div>
                )}
              </ThreadPrimitive.Messages>
            </ThreadPrimitive.Viewport>
          </ThreadPrimitive.Root>
        </div>
        <StatusBar sessionId={sessionId} />
        <ChatComposer sessionId={sessionId} />
      </div>
    </AssistantRuntimeProvider>
  );
}

export function ChatWindow() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  return (
    <div className="bg-app flex h-screen w-screen overflow-hidden">
      <div className="border-border flex w-56 flex-col border-r">
        <SessionList
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeSessionId ? (
          <ChatPanel key={activeSessionId} sessionId={activeSessionId} />
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            Select a session to begin
          </div>
        )}
      </div>
    </div>
  );
}
