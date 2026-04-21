import {
  ComposerPrimitive,
} from '@assistant-ui/react';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

import { PermissionModePopover } from './PermissionModePopover';

const MODELS = [
  { id: 'sonnet', label: 'Sonnet 4' },
  { id: 'opus', label: 'Opus 4' },
  { id: 'haiku', label: 'Haiku' },
];

const MODES = ['default', 'accept_edits', 'plan'] as const;

interface ChatComposerProps {
  sessionId: string;
}

export function ChatComposer({ sessionId }: ChatComposerProps) {
  const [selectedModel, setSelectedModel] = useState('sonnet');
  const [permissionMode, setPermissionMode] = useState('default');
  const [showModePopover, setShowModePopover] = useState(false);

  return (
    <ComposerPrimitive.Root className="flex items-center gap-2 border-t px-4 py-3">
      <ComposerPrimitive.AddAttachment className="text-muted-foreground flex-shrink-0 cursor-pointer p-1">
        +
      </ComposerPrimitive.AddAttachment>
      <ComposerPrimitive.Input
        className="flex-1 bg-transparent text-sm outline-none"
        placeholder="Type a message..."
        autoFocus
        onKeyDown={(e) => {
          if (e.shiftKey && e.key === 'Tab') {
            e.preventDefault();
            const currentIdx = MODES.indexOf(permissionMode as typeof MODES[number]);
            const nextIdx = (currentIdx + 1) % MODES.length;
            const nextMode = MODES[nextIdx];
            setPermissionMode(nextMode);
            invoke('chat_set_permission_mode', { sessionId, mode: nextMode }).catch(console.error);
            setShowModePopover(true);
            setTimeout(() => setShowModePopover(false), 1500);
          }
        }}
      />
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        className="bg-surface text-muted-foreground rounded px-2 py-1 text-xs"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      <ComposerPrimitive.Send className="bg-primary text-primary-foreground rounded px-3 py-1 text-sm">
        Send
      </ComposerPrimitive.Send>
      {showModePopover && <PermissionModePopover mode={permissionMode} />}
    </ComposerPrimitive.Root>
  );
}