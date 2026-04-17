import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from '@assistant-ui/react';

import { AssistantRuntimeProvider, useLocalRuntime, useAuiState } from '@assistant-ui/react';
import { ThreadPrimitive, ComposerPrimitive } from '@assistant-ui/react';
import { useEffect, useRef, useState } from 'react';

import type { ProfileConfig } from '../types';

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
    <div className="border-border bg-app mb-2 rounded border p-3">
      <div className="text-text mb-1 text-sm font-medium">Tool: {tool.toolName}</div>
      <div className="mb-2">
        <label className="text-muted mb-1 block text-xs uppercase">Arguments</label>
        <textarea
          className="bg-subtle text-text w-full resize-none rounded p-2 font-mono text-xs"
          rows={Math.min(8, (argsText.match(/\n/g) ?? []).length + 2)}
          value={argsText}
          onChange={(e) => handleArgsChange(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-xs font-medium hover:opacity-90"
          onClick={handleApprove}
        >
          Approve
        </button>
        <button
          className="bg-danger rounded px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          onClick={handleDeny}
        >
          Deny
        </button>
      </div>
      {err && <div className="text-danger mt-2 text-xs">{err}</div>}
    </div>
  );
}

// =============================================================================
// WaitingInputCard
// =============================================================================

function WaitingInputCard({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [value, setValue] = useState('');

  async function handleSubmit() {
    await chatSendInput(sessionId, value);
    setValue('');
    onClose();
  }

  return (
    <div className="border-border bg-app mb-2 rounded border p-3">
      <div className="text-text mb-2 text-sm font-medium">Input Required</div>
      <textarea
        className="bg-subtle text-text w-full resize-none rounded p-2 text-xs"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type your response..."
        autoFocus
      />
      <button
        className="bg-primary text-primary-foreground mt-2 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90"
        onClick={handleSubmit}
      >
        Submit
      </button>
    </div>
  );
}

// =============================================================================
// MessageList — manual rendering using useAuiState
// =============================================================================

function MessageList({ className }: { className?: string }) {
  const messages = useAuiState((s) => s.thread.messages);

  if (messages.length === 0) {
    return (
      <div className={`flex flex-col gap-3 p-4 ${className ?? ''}`}>
        <div className="text-muted text-sm">No messages yet. Start a conversation.</div>
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
                <div className="text-muted mt-1 animate-pulse text-xs">Thinking...</div>
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
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [activeToolCall, setActiveToolCall] = useState<ActiveToolCall | null>(null);
  const [waitingInput, setWaitingInput] = useState(false);

  useNotificationSound(sessionId, sessionState);

  useEffect(() => {
    let unlistenState: (() => void) | undefined;
    let unlistenTool: (() => void) | undefined;

    onChatSessionState((event) => {
      if (event.session_id !== sessionId) return;
      const state = event.state as SessionState;
      setSessionState(state);
      setWaitingInput(state === 'waiting_input');
      if (state !== 'waiting_permission') {
        setActiveToolCall(null);
      }
    }).then((fn) => {
      unlistenState = fn;
    });

    onChatToolCall((event) => {
      if (event.session_id !== sessionId) return;
      setActiveToolCall({
        toolCallId: event.tool_call_id,
        toolName: event.tool_name,
        arguments: event.arguments,
      });
      setSessionState('waiting_permission');
    }).then((fn) => {
      unlistenTool = fn;
    });

    return () => {
      unlistenState?.();
      unlistenTool?.();
    };
  }, [sessionId]);

  return (
    <div className="flex h-full flex-col">
      {/* State banner */}
      {sessionState === 'running' && (
        <div className="bg-primary/10 text-primary flex items-center justify-center py-1 text-xs">
          Thinking...
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
                    onClick={() => {}}
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
  onStart,
  onCancel,
}: {
  profiles: ProfileConfig[];
  defaultProfileId: string;
  onStart: (profileId: string, directory: string) => void;
  onCancel: () => void;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState(defaultProfileId);
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!directory.trim()) {
      setError('Directory is required');
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
      <div className="border-border bg-app w-[420px] rounded-lg border p-6 shadow-md">
        <h2 className="text-text mb-5 text-lg font-semibold">New Chat Session</h2>

        <div className="mb-4">
          <label className="text-muted mb-1.5 block text-xs uppercase">Profile</label>
          <select
            className="bg-subtle text-text w-full rounded p-2.5 text-sm"
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-5">
          <label className="text-muted mb-1.5 block text-xs uppercase">Working Directory</label>
          <input
            className="bg-subtle text-text w-full rounded p-2.5 text-sm"
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="C:\path\to\project"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleStart();
            }}
          />
        </div>

        {error && <div className="text-danger mb-4 text-sm">{error}</div>}

        <div className="flex justify-end gap-3">
          <button
            className="text-muted hover:text-text rounded px-4 py-2 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="bg-primary text-primary-foreground rounded px-5 py-2 text-sm font-medium hover:opacity-90"
            onClick={handleStart}
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ChatWindow
// =============================================================================

export function ChatWindow({
  profiles,
  activeProfileId,
  onBack,
}: {
  profiles: ProfileConfig[];
  activeProfileId: string;
  onBack: () => void;
}) {
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
                  <button
                    className="text-muted hover:text-text text-sm"
                    onClick={() => {
                      setActiveSessionId(null);
                      setShowNewSession(false);
                    }}
                  >
                    ← Back
                  </button>
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
