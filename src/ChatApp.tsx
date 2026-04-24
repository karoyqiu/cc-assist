import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { ThreadPrimitive } from '@assistant-ui/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ModelOption } from './components/chat/ModelSelector';
import type { PermissionMode, SessionState } from './components/chat/StatusBar';
import type { ProfilesStore } from './types';

import {
  ChatPanel,
  type PendingPermission,
  type PendingQuestion,
} from './components/chat/ChatPanel';
import { SessionDialog } from './components/chat/SessionDialog';
import { SessionList } from './components/chat/SessionList';
import { chatCommands, type RecentSessionInfo, type SessionInfo } from './lib/chatCommands';
import { createTauriChatModelAdapter } from './lib/TauriChatModelAdapter';
import './lib/i18n';
import './App.css';

interface SessionStateMap {
  [sessionId: string]: { state: SessionState; permissionMode: PermissionMode };
}
interface TokenUsage {
  contextPct: number;
  subscriptionPct: number;
}

function ChatAppInner() {
  const { i18n } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStates, setSessionStates] = useState<SessionStateMap>({});
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ contextPct: 0, subscriptionPct: 0 });
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [selectedModel, setSelectedModel] = useState('main');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'new' | 'resume'>('new');
  const [dialogSdkSessionId, setDialogSdkSessionId] = useState<string | undefined>();
  const [dialogInitDir, setDialogInitDir] = useState('');
  const [dialogInitProfile, setDialogInitProfile] = useState('');
  const adapterRef = useRef<ReturnType<typeof createTauriChatModelAdapter> | null>(null);

  // Runtime is recreated when activeSessionId changes
  const adapter = activeSessionId
    ? (adapterRef.current = createTauriChatModelAdapter(activeSessionId))
    : (adapterRef.current ?? createTauriChatModelAdapter(''));
  const runtime = useLocalRuntime(adapter);

  // Load config on mount
  useEffect(() => {
    invoke<ProfilesStore>('get_config').then((s) => {
      setStore(s);
      return i18n.changeLanguage(s.locale);
    });
    getCurrentWindow().show().catch(console.error);
  }, [i18n]);

  // Listen for session-state events
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; state: SessionState }>('session-state', (e) => {
      setSessionStates((prev) => ({
        ...prev,
        [e.payload.sessionId]: { ...prev[e.payload.sessionId], state: e.payload.state },
      }));
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === e.payload.sessionId ? { ...s, state: e.payload.state } : s,
        ),
      );
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for permission requests
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; toolName: string; command: string }>(
      'permission-request',
      (e) => {
        setPendingPermissions((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sessionId: e.payload.sessionId,
            toolName: e.payload.toolName,
            command: e.payload.command,
          },
        ]);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for request-input with choices
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; question: string; choices?: string[] }>(
      'request-input',
      (e) => {
        if (e.payload.choices && e.payload.choices.length > 0) {
          setPendingQuestions((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sessionId: e.payload.sessionId,
              question: e.payload.question,
              choices: e.payload.choices!,
            },
          ]);
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for result (token usage)
  useEffect(() => {
    const unlisten = listen<{
      sessionId: string;
      usage: { contextPct: number; subscriptionPct: number } | null;
    }>('result', (e) => {
      if (e.payload.usage && e.payload.sessionId === activeSessionId) {
        setTokenUsage(e.payload.usage);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [activeSessionId]);

  const refreshSessions = useCallback(async () => {
    const list = await chatCommands.listSessions();
    setSessions(list);
  }, []);

  function openNewSessionDialog() {
    setDialogMode('new');
    setDialogSdkSessionId(undefined);
    setDialogInitDir('');
    setDialogInitProfile(store?.active_profile_id ?? '');
    setDialogOpen(true);
  }

  function openResumeSessionDialog(session: RecentSessionInfo) {
    setDialogMode('resume');
    setDialogSdkSessionId(session.sessionId);
    setDialogInitDir(session.cwd);
    setDialogInitProfile(store?.active_profile_id ?? '');
    setDialogOpen(true);
  }

  async function handleDialogConfirm(profileId: string, directory: string, sdkSessionId?: string) {
    let result;
    if (sdkSessionId) {
      result = await chatCommands.resumeSession(profileId, sdkSessionId, directory);
    } else {
      result = await chatCommands.createSession(profileId, directory);
    }
    await refreshSessions();
    setActiveSessionId(result.sessionId);
  }

  async function handleCloseSession(sessionId: string) {
    await chatCommands.closeSession(sessionId);
    await refreshSessions();
    if (activeSessionId === sessionId) setActiveSessionId(null);
  }

  async function handleCompact() {
    if (!activeSessionId) return;
    await chatCommands.compact(activeSessionId);
  }

  async function handleAllowPermission(sessionId: string, toolName: string) {
    await chatCommands.allowPermission(sessionId, toolName);
    setPendingPermissions((prev) =>
      prev.filter((p) => !(p.sessionId === sessionId && p.toolName === toolName)),
    );
  }

  async function handleAllowAlwaysPermission(sessionId: string, toolName: string) {
    // TODO(Task 15): call chat_allow_always_permission once allowlist Rust module is wired
    await chatCommands.allowPermission(sessionId, toolName);
    setPendingPermissions((prev) =>
      prev.filter((p) => !(p.sessionId === sessionId && p.toolName === toolName)),
    );
  }

  async function handleDenyPermission(sessionId: string, toolName: string) {
    await chatCommands.denyPermission(sessionId, toolName);
    setPendingPermissions((prev) =>
      prev.filter((p) => !(p.sessionId === sessionId && p.toolName === toolName)),
    );
  }

  async function handleAnswerQuestion(sessionId: string, answer: string) {
    await chatCommands.answerQuestion(sessionId, answer);
    setPendingQuestions((prev) => prev.filter((q) => q.sessionId !== sessionId));
  }

  const activeSessionState: SessionState = activeSessionId
    ? (sessionStates[activeSessionId]?.state ?? 'idle')
    : 'idle';
  const activePermissionMode: PermissionMode = activeSessionId
    ? (sessionStates[activeSessionId]?.permissionMode ?? 'default')
    : 'default';

  // Build model options from active profile
  const activeProfile = store?.profiles.find((p) => p.id === store.active_profile_id);
  const modelOptions: ModelOption[] = activeProfile?.models
    ? (Object.entries(activeProfile.models) as [string, string | undefined][])
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([key, value]) => ({ key, label: value }))
    : [{ key: 'main', label: 'Default' }];

  if (!store) return null;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="bg-background flex h-screen w-screen overflow-hidden">
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onNew={openNewSessionDialog}
          onClose={handleCloseSession}
          onOpenSettings={() => invoke('toggle_settings_window')}
          onResumeSession={openResumeSessionDialog}
        />
        {activeSessionId !== null ? (
          <ChatPanel
            modelOptions={
              modelOptions.length > 0 ? modelOptions : [{ key: 'main', label: 'Default' }]
            }
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onCompact={handleCompact}
            contextPct={tokenUsage.contextPct}
            subscriptionPct={tokenUsage.subscriptionPct}
            gitBranch=""
            gitDirty={false}
            permissionMode={activePermissionMode}
            sessionState={activeSessionState}
            pendingPermissions={pendingPermissions.filter((p) => p.sessionId === activeSessionId)}
            pendingQuestions={pendingQuestions.filter((q) => q.sessionId === activeSessionId)}
            onAllowPermission={handleAllowPermission}
            onAllowAlwaysPermission={handleAllowAlwaysPermission}
            onDenyPermission={handleDenyPermission}
            onAnswerQuestion={handleAnswerQuestion}
          />
        ) : (
          <div className="bg-background text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
            <p className="text-sm">No active session</p>
            <p className="text-xs opacity-60">Select or create a session to start</p>
          </div>
        )}
      </ThreadPrimitive.Root>
      <SessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        sdkSessionId={dialogSdkSessionId}
        initialProfileId={dialogInitProfile}
        initialDirectory={dialogInitDir}
        profiles={store.profiles}
        recentDirectories={store.recent_directories}
        onConfirm={handleDialogConfirm}
      />
    </AssistantRuntimeProvider>
  );
}

export function ChatApp() {
  return <ChatAppInner />;
}
