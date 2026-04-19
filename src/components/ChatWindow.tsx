import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';

import { AssistantRuntimeProvider, useLocalRuntime, useAuiState } from '@assistant-ui/react';
import { ThreadPrimitive, ComposerPrimitive } from '@assistant-ui/react';
import { useEffect, useRef, useState } from 'react';

import type { ProfileConfig, RecentDirectories } from '../types';

import { DirectoryCombobox } from '@/components/DirectoryCombobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { useNotificationSound } from '../hooks/useNotificationSound';
import {
  type LiveSession,
  chatCreateSession,
  chatSendMessage,
  chatToolApprove,
  chatToolDeny,
  chatSendInput,
  chatStop,
  chatCloseSession,
  onChatStreamChunk,
  onChatToolCall,
  onChatSessionState,
} from '../lib/chat';
import { ChatSidebar } from './ChatSidebar';
import { ChatStatusBar } from './ChatStatusBar';

// =============================================================================
// Types
// =============================================================================

// MessageStatus copied from @assistant-ui/core to avoid import issues
type MessageStatus =
  | {
      readonly type: 'running';
    }
  | {
      readonly type: 'requires-action';
      readonly reason: 'tool-calls' | 'interrupt';
    }
  | {
      readonly type: 'complete';
      readonly reason: 'stop' | 'unknown';
    }
  | {
      readonly type: 'incomplete';
      readonly reason: 'cancelled' | 'tool-calls' | 'length' | 'content-filter' | 'other' | 'error';
      readonly error?: string;
    };

type SessionState = 'idle' | 'running' | 'waiting_permission' | 'waiting_input';

interface ActiveToolCall {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

// =============================================================================
// TauriChatAdapter
// =============================================================================

class TauriChatAdapter implements ChatModelAdapter {
  private sessionId: string | null = null;

  setSession(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  async *run({ messages, abortSignal }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult> {
    if (!this.sessionId) {
      yield {
        content: [{ type: 'text', text: 'Error: No active session' }],
        status: { type: 'incomplete', reason: 'other' } as unknown as MessageStatus,
      };
      return;
    }

    // Get last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    const userText = lastUserMsg.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    if (!userText.trim()) return;

    const msgId = crypto.randomUUID();
    const textChunks: string[] = [];
    let streamDone = false;
    let streamError: string | undefined;

    // Listen for chunks
    const unlisten = await onChatStreamChunk((chunk) => {
      if (chunk.session_id !== this.sessionId || chunk.message_id !== msgId) return;
      if (chunk.error) {
        streamError = chunk.error;
        streamDone = true;
        return;
      }
      if (chunk.chunk) {
        textChunks.push(chunk.chunk);
      }
      if (chunk.done) {
        streamDone = true;
      }
    });

    try {
      // Send message (fire-and-forget)
      chatSendMessage(this.sessionId, userText).catch(() => {});

      // Wait for completion or abort
      await new Promise<void>((resolve) => {
        const check = () => {
          if (streamDone || abortSignal.aborted) {
            resolve();
            return;
          }
          setTimeout(check, 50);
        };
        check();
      });

      if (abortSignal.aborted) {
        chatStop(this.sessionId).catch(() => {});
        yield {
          content: [{ type: 'text', text: textChunks.join('') }],
          status: { type: 'incomplete', reason: 'cancelled' } as unknown as MessageStatus,
        };
        return;
      }

      if (streamError) {
        yield {
          content: [],
          status: { type: 'incomplete', reason: 'error' } as unknown as MessageStatus,
        };
        return;
      }

      yield {
        content: [{ type: 'text', text: textChunks.join('') }],
        status: { type: 'complete', reason: 'stop' } as unknown as MessageStatus,
      };
    } finally {
      unlisten();
    }
  }

  stop(): void {
    if (this.sessionId) {
      chatStop(this.sessionId).catch(console.error);
    }
  }
}

// =============================================================================
// ChatSessionProvider
// =============================================================================

function ChatSessionProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: React.ReactNode;
}) {
  const adapterRef = useRef<TauriChatAdapter | null>(null);
  if (!adapterRef.current) {
    adapterRef.current = new TauriChatAdapter();
  }
  adapterRef.current.setSession(sessionId);

  const runtime = useLocalRuntime(adapterRef.current);

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

// =============================================================================
// ToolApprovalCard
// =============================================================================

function ToolApprovalCard({
  tool,
  sessionId,
  onClose,
}: {
  tool: ActiveToolCall;
  sessionId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [argsText, setArgsText] = useState(() => JSON.stringify(tool.arguments, null, 2));
  const [modifiedArgs, setModifiedArgs] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function handleArgsChange(value: string) {
    setArgsText(value);
    try {
      setModifiedArgs(JSON.parse(value));
    } catch {
      setModifiedArgs(null);
    }
  }

  async function handleApprove() {
    try {
      await chatToolApprove(sessionId, tool.toolCallId, modifiedArgs ?? undefined);
      onClose();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function handleDeny() {
    try {
      await chatToolDeny(sessionId, tool.toolCallId);
      onClose();
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool: {tool.toolName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted text-xs uppercase">{t('chat.arguments')}</Label>
          <Textarea
            value={argsText}
            onChange={(e) => handleArgsChange(e.target.value)}
            rows={Math.min(8, (argsText.match(/\n/g) ?? []).length + 2)}
            className="font-mono"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleApprove}>
            {t('chat.approve')}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDeny}>
            {t('chat.deny')}
          </Button>
        </div>
        {err && <p className="text-destructive text-xs">{err}</p>}
      </CardContent>
    </Card>
  );
}

// WaitingInputCard
// =============================================================================

function WaitingInputCard({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  async function handleSubmit() {
    await chatSendInput(sessionId, value);
    setValue('');
    onClose();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('chat.inputRequired')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('chat.inputRequired')}
          autoFocus
          rows={3}
        />
        <Button size="sm" onClick={handleSubmit}>
          {t('chat.submit')}
        </Button>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MessageList — manual rendering using useAuiState
// =============================================================================

function MessageList({ className }: { className?: string }) {
  const { t } = useTranslation();
  const messages = useAuiState((s) => s.thread.messages);

  if (messages.length === 0) {
    return (
      <div className={`flex flex-col gap-3 p-4 ${className ?? ''}`}>
        <div className="text-muted text-sm">{t('chat.noMessages')}</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 p-4 ${className ?? ''}`}>
      {messages.map((message) => {
        const textParts = message.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('');

        const isUser = message.role === 'user';
        const isRunning = message.status?.type === 'running';

        return (
          <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                isUser ? 'bg-surface text-foreground' : 'bg-subtle text-foreground'
              }`}
            >
              {textParts && <div className="text-sm whitespace-pre-wrap">{textParts}</div>}
              {isRunning && (
                <div className="text-muted mt-1 animate-pulse text-xs">{t('chat.thinking')}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// ChatInterface
// =============================================================================

function ChatInterface({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [activeToolCall, setActiveToolCall] = useState<ActiveToolCall | null>(null);
  const [waitingInput, setWaitingInput] = useState(false);

  useNotificationSound(sessionId, sessionState);

  useEffect(() => {
    let cancelled = false;

    const stateP = onChatSessionState((event) => {
      if (cancelled) return;
      if (event.session_id !== sessionId) return;
      const state = event.state as SessionState;
      setSessionState(state);
      setWaitingInput(state === 'waiting_input');
      if (state !== 'waiting_permission') {
        setActiveToolCall(null);
      }
    });

    const toolP = onChatToolCall((event) => {
      if (cancelled) return;
      if (event.session_id !== sessionId) return;
      setActiveToolCall({
        toolCallId: event.tool_call_id,
        toolName: event.tool_name,
        arguments: event.arguments,
      });
      setSessionState('waiting_permission');
    });

    return () => {
      cancelled = true;
      stateP.then((fn) => fn());
      toolP.then((fn) => fn());
    };
  }, [sessionId]);

  return (
    <div className="flex h-full flex-col">
      {/* State banner */}
      {sessionState === 'running' && (
        <div className="bg-primary/10 text-primary flex items-center justify-center py-1 text-xs">
          {t('chat.thinking')}
        </div>
      )}

      {/* Tool / input overlays */}
      {activeToolCall && (
        <div className="px-4 pt-2">
          <ToolApprovalCard
            tool={activeToolCall}
            sessionId={sessionId}
            onClose={() => setActiveToolCall(null)}
          />
        </div>
      )}

      {waitingInput && (
        <div className="px-4 pt-2">
          <WaitingInputCard sessionId={sessionId} onClose={() => setWaitingInput(false)} />
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Root>
          <MessageList />
        </ThreadPrimitive.Root>
      </div>

      {/* Status bar */}
      <ChatStatusBar sessionId={sessionId} />

      {/* Composer */}
      <div className="border-border border-t p-3">
        <ComposerPrimitive.Root>
          <ComposerPrimitive.AttachmentDropzone className="flex flex-col gap-2">
            {/* Attachment previews */}
            <ComposerPrimitive.Attachments>
              {({ attachment }) => (
                <div className="bg-subtle text-muted flex items-center gap-2 rounded px-2 py-1 text-xs">
                  <span className="max-w-[120px] truncate">{attachment.name}</span>
                  <button
                    className="hover:text-danger ml-auto shrink-0"
                    onClick={() => {
                      // TODO: implement attachment removal via attachment.remove() or runtime API
                      console.info('Remove attachment:', attachment.name);
                    }}
                    title="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              )}
            </ComposerPrimitive.Attachments>

            {/* Input row */}
            <div className="flex items-end gap-2">
              <ComposerPrimitive.AddAttachment
                className="text-muted hover:text-text shrink-0 rounded p-2 text-sm"
                title="Attach files"
              >
                📎
              </ComposerPrimitive.AddAttachment>
              <ComposerPrimitive.Input
                className="bg-subtle text-text flex-1 resize-none rounded p-3 text-sm"
                placeholder="Send a message..."
              />
              <div className="shrink-0">
                {isRunning ? (
                  <ComposerPrimitive.Cancel className="text-muted hover:text-text rounded px-4 py-1.5 text-sm">
                    Cancel
                  </ComposerPrimitive.Cancel>
                ) : (
                  <ComposerPrimitive.Send className="bg-primary text-primary-foreground rounded px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    Send
                  </ComposerPrimitive.Send>
                )}
              </div>
            </div>
          </ComposerPrimitive.AttachmentDropzone>
        </ComposerPrimitive.Root>
      </div>
    </div>
  );
}

// =============================================================================
// NewSessionScreen
// =============================================================================

function NewSessionScreen({
  profiles,
  defaultProfileId,
  recentDirectories,
  onStart,
  onCancel,
}: {
  profiles: ProfileConfig[];
  defaultProfileId: string;
  recentDirectories: RecentDirectories;
  onStart: (profileId: string, directory: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [selectedProfileId, setSelectedProfileId] = useState(defaultProfileId);
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!directory.trim()) {
      setError(t('errors.directoryRequired'));
      return;
    }
    setError(null);
    try {
      await onStart(selectedProfileId, directory);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-[420px]">
        <CardHeader>
          <CardTitle>{t('chat.newSession')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t('chat.profile')}</Label>
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('chat.profile')} />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('chat.workingDirectory')}</Label>
            <DirectoryCombobox
              directories={recentDirectories}
              value={directory}
              onChange={setDirectory}
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t('chat.cancel')}
            </Button>
            <Button size="sm" onClick={handleStart}>
              {t('chat.startSession')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// ChatWindow
// =============================================================================

export function ChatWindow({
  profiles,
  activeProfileId,
  recentDirectories,
  onBack,
}: {
  profiles: ProfileConfig[];
  activeProfileId: string;
  recentDirectories: RecentDirectories;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Map<string, LiveSession>>(new Map());
  const [createError, setCreateError] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);

  async function handleSelectSession(sessionId: string) {
    setActiveSessionId(sessionId);
    setShowNewSession(false);
  }

  async function handleCloseSession(sessionId: string) {
    await chatCloseSession(sessionId).catch(console.error);
    setSessions((prev) => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
    }
  }

  async function handleStart(profileId: string, directory: string) {
    try {
      setCreateError(null);
      const liveSession = await chatCreateSession(profileId, directory);
      setSessions((prev) => new Map(prev).set(liveSession.id, liveSession));
      setActiveSessionId(liveSession.id);
      setShowNewSession(false);
    } catch (e) {
      setCreateError(String(e));
    }
  }

  const activeSession = activeSessionId ? (sessions.get(activeSessionId) ?? null) : null;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <ChatSidebar
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={() => setShowNewSession(true)}
        onCloseSession={handleCloseSession}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {showNewSession || !activeSession ? (
          <NewSessionScreen
            profiles={profiles}
            defaultProfileId={activeProfileId}
            recentDirectories={recentDirectories}
            onStart={handleStart}
            onCancel={() => {
              setShowNewSession(false);
              if (!activeSession) {
                onBack();
              }
            }}
          />
        ) : activeSession ? (
          <ChatSessionProvider sessionId={activeSession.id}>
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveSessionId(null);
                      setShowNewSession(false);
                    }}
                  >
                    {t('chat.back')}
                  </Button>
                  <span className="text-text text-sm font-medium">{activeSession.name}</span>
                </div>
                {createError && <span className="text-danger text-xs">{createError}</span>}
              </div>
              <ChatInterface sessionId={activeSession.id} />
            </div>
          </ChatSessionProvider>
        ) : null}
      </div>
    </div>
  );
}
