import {
  ComposerPrimitive,
} from '@assistant-ui/react';
import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

import { PermissionModePopover } from './PermissionModePopover';

interface SlashCommand {
  name: string;
  description: string;
  argument_hint?: string;
}

const STATIC_COMMANDS: SlashCommand[] = [
  { name: 'help', description: 'Show available commands' },
  { name: 'clear', description: 'Clear the conversation' },
  { name: 'model', description: 'Switch model', argument_hint: '<model-id>' },
  { name: 'cancel', description: 'Cancel the current request' },
  { name: 'context', description: 'Show context usage' },
  { name: 'debug', description: 'Toggle debug mode' },
  { name: 'resume', description: 'Resume an existing session' },
  { name: 'fork', description: 'Fork the current session' },
  { name: 'rewind', description: 'Rewind tracked files to a previous user message', argument_hint: '[uuid]' },
];

const MODELS = [
  { id: 'sonnet', label: 'Sonnet 4' },
  { id: 'opus', label: 'Opus 4' },
  { id: 'haiku', label: 'Haiku' },
];

const MODES = ['default', 'accept_edits', 'plan'] as const;

interface Attachment {
  name: string;
  size: number;
  path: string;
}

interface ChatComposerProps {
  sessionId: string;
  onSend?: (content: string, attachments: string[]) => void;
}

export function ChatComposer({ sessionId }: ChatComposerProps) {
  const [selectedModel, setSelectedModel] = useState('sonnet');
  const [permissionMode, setPermissionMode] = useState('default');
  const [showModePopover, setShowModePopover] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const slashRef = useRef<HTMLDivElement>(null);

  const filteredCommands = STATIC_COMMANDS.filter((c) =>
    c.name.includes(slashQuery.toLowerCase())
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const newAttachments = files.slice(0, 10 - attachments.length).map((file) => ({
      name: file.name,
      size: file.size,
      path: (file as any).path ?? file.name,
    }));
    setAttachments((prev) => [...prev, ...newAttachments].slice(0, 10));
  }, [attachments.length]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="flex flex-col border-t">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex items-center gap-2 px-4 py-3 ${isDragOver ? 'bg-muted' : ''}`}
      >
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
            if (e.key === '/' && !slashOpen) {
              setSlashOpen(true);
              setSlashQuery('');
            }
            if (slashOpen && e.key === 'Escape') {
              setSlashOpen(false);
            }
          }}
          onChange={(e) => {
            if (slashOpen) {
              setSlashQuery(e.target.value.slice(1));
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
      </div>
      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1 px-12 pb-2">
          {attachments.map((a, i) => (
            <span
              key={i}
              className="bg-muted flex items-center gap-1 rounded px-2 py-0.5 text-xs"
            >
              {a.name} ({(a.size / 1024).toFixed(0)}KB)
              <button
                onClick={() => removeAttachment(i)}
                className="text-muted-foreground cursor-pointer hover:text-foreground"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Slash command popup */}
      {slashOpen && filteredCommands.length > 0 && (
        <div ref={slashRef} className="absolute bottom-full left-0 mb-1 w-64 rounded border bg-surface shadow-lg">
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.name}
              onClick={() => {
                setSlashOpen(false);
                setSlashQuery('');
              }}
              className="flex w-full cursor-pointer flex-col items-start px-3 py-2 text-left text-sm hover:bg-subtle"
            >
              <span className="font-mono">/{cmd.name}</span>
              <span className="text-muted-foreground text-xs">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
