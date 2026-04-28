import { ThreadPrimitive } from '@assistant-ui/react';
import { type FC } from 'react';

import type { ModelOption } from './ModelSelector';
import type { PermissionRequestPayload } from './PermissionRequestCard';

import { ChatMessage } from './ChatMessage';
import { Composer } from './Composer';
import { PermissionRequestCard } from './PermissionRequestCard';
import { StatusBar, type PermissionMode, type SessionState } from './StatusBar';
import { UserQuestionCard } from './UserQuestionCard';

export interface PendingPermission extends PermissionRequestPayload {
  id: string;
}

export interface PendingQuestion {
  id: string;
  sessionId: string;
  question: string;
  choices: string[];
}

interface ChatPanelProps {
  modelOptions: ModelOption[];
  selectedModel: string;
  onModelChange: (key: string) => void;
  onCompact: () => Promise<void>;
  contextPct: number;
  subscriptionPct: number;
  gitBranch: string;
  gitDirty: boolean;
  permissionMode: PermissionMode;
  sessionState: SessionState;
  pendingPermissions: PendingPermission[];
  pendingQuestions: PendingQuestion[];
  onAllowPermission: (sessionId: string, toolName: string) => void;
  onAllowAlwaysPermission: (sessionId: string, toolName: string) => void;
  onDenyPermission: (sessionId: string, toolName: string) => void;
  onAnswerQuestion: (sessionId: string, answer: string) => void;
}

export const ChatPanel: FC<ChatPanelProps> = ({
  modelOptions,
  selectedModel,
  onModelChange,
  onCompact,
  contextPct,
  subscriptionPct,
  gitBranch,
  gitDirty,
  permissionMode,
  sessionState,
  pendingPermissions,
  pendingQuestions,
  onAllowPermission,
  onAllowAlwaysPermission,
  onDenyPermission,
  onAnswerQuestion,
}) => {
  return (
    <div data-testid="chat-panel" className="bg-background flex flex-1 flex-col overflow-hidden">
      <ThreadPrimitive.Viewport
        data-testid="chat-thread"
        className="flex flex-1 flex-col overflow-y-auto p-4 pt-8"
      >
        <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
        {pendingPermissions.map((p) => (
          <PermissionRequestCard
            key={p.id}
            payload={p}
            onAllow={onAllowPermission}
            onAllowAlways={onAllowAlwaysPermission}
            onDeny={onDenyPermission}
          />
        ))}
        {pendingQuestions.map((q) => (
          <UserQuestionCard
            key={q.id}
            sessionId={q.sessionId}
            question={q.question}
            choices={q.choices}
            onAnswer={onAnswerQuestion}
          />
        ))}
        <div aria-hidden="true" className="h-4" />
      </ThreadPrimitive.Viewport>
      <div className="shrink-0 px-4 pb-2">
        <Composer
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          onCompact={onCompact}
        />
      </div>
      <StatusBar
        contextPct={contextPct}
        subscriptionPct={subscriptionPct}
        gitBranch={gitBranch}
        gitDirty={gitDirty}
        permissionMode={permissionMode}
        sessionState={sessionState}
      />
    </div>
  );
};
