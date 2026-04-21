// ChatWindowApp - placeholder shell
// TODO: Wire up assistant-ui runtime with TauriChatModelAdapter
// The correct approach in @assistant-ui/react v0.12:
// 1. Wrap in AuiProvider with AssistantClient
// 2. Use useLocalRuntime(chatModelAdapter) to create AssistantRuntime
// 3. ThreadPrimitive components consume runtime from context

import { useState } from 'react';

export function ChatWindowApp() {
  const [activeSessionId] = useState<string | null>(null);

  return (
    <div className="bg-app flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <div className="border-border flex w-56 flex-col border-r">
        <div className="flex-1 overflow-y-auto p-2 text-sm text-muted-foreground">
          Session list placeholder
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeSessionId ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden p-4">
              <div className="text-muted-foreground text-sm">
                Chat session: {activeSessionId}
              </div>
            </div>
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">
              Status bar placeholder
            </div>
            <div className="border-t px-4 py-3">
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Composer placeholder..."
              />
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            Select a session to begin
          </div>
        )}
      </div>
    </div>
  );
}