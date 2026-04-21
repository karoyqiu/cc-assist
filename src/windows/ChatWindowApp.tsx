import { useState } from 'react';
import { ThreadPrimitive } from '@assistant-ui/react';
import { ChatThread } from '../components/ChatThread';
import { ChatComposer } from '../components/ChatComposer';
import { createTauriChatModelAdapter } from '../components/TauriChatModelAdapter';

function SessionList({ activeSessionId, onSelect }: { activeSessionId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-2 text-sm text-muted-foreground">
      Session list placeholder
    </div>
  );
}

function StatusBar({ sessionId }: { sessionId: string }) {
  return (
    <div className="border-t px-4 py-1 text-xs text-muted-foreground">
      Session: {sessionId}
    </div>
  );
}

export function ChatWindowApp() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const adapter = activeSessionId ? createTauriChatModelAdapter(activeSessionId) : null;

  return (
    <div className="bg-app flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <div className="border-border flex w-56 flex-col border-r">
        <SessionList
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
        />
      </div>

      {/* Chat panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeSessionId && adapter ? (
          <ThreadPrimitive.RuntimeAdapter adapter={adapter}>
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <ChatThread />
              </div>
              <StatusBar sessionId={activeSessionId} />
              <ChatComposer />
            </div>
          </ThreadPrimitive.RuntimeAdapter>
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            Select a session to begin
          </div>
        )}
      </div>
    </div>
  );
}