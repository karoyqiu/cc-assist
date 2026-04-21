import {
  ComposerPrimitive,
} from '@assistant-ui/react';
import { useState } from 'react';

const MODELS = [
  { id: 'sonnet', label: 'Sonnet 4' },
  { id: 'opus', label: 'Opus 4' },
  { id: 'haiku', label: 'Haiku' },
];

export function ChatComposer() {
  const [selectedModel, setSelectedModel] = useState('sonnet');

  return (
    <ComposerPrimitive.Root className="flex items-center gap-2 border-t px-4 py-3">
      <ComposerPrimitive.AddAttachment className="text-muted-foreground flex-shrink-0 cursor-pointer p-1">
        +
      </ComposerPrimitive.AddAttachment>
      <ComposerPrimitive.Input
        className="flex-1 bg-transparent text-sm outline-none"
        placeholder="Type a message..."
        autoFocus
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
    </ComposerPrimitive.Root>
  );
}