import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { listen } from '@tauri-apps/api/event';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { PlusIcon, SettingsIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Session } from '@/lib/terminal';
import type { ProfileConfig, RecentDirectories } from '@/types';

import { DirectoryCombobox } from '@/components/DirectoryCombobox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  addSession,
  applyFontToAllTerminals,
  closeSession,
  createSession,
  getActiveSessionId,
  getExitedSessionId,
  getFontSettings,
  getSessions,
  listSessions,
  registerSessionWriter,
  registerTerminal,
  removeSession,
  reorderSessions,
  resizeSession,
  setActiveSessionId,
  setExitedSessionId,
  startOutputListener,
  stopOutputListener,
  unregisterSessionWriter,
  unregisterTerminal,
  writeToSession,
} from '@/lib/terminal';

interface SessionTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
}

function SortableSession({
  session,
  activeId,
  activeProfileColor,
  onSelect,
  onClose,
}: {
  session: Session;
  activeId: string | null;
  activeProfileColor: string;
  onSelect: (id: string) => void;
  onClose: (e: React.MouseEvent, id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: session.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderLeft:
      session.id === activeId ? `2px solid ${activeProfileColor}` : '2px solid transparent',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(session.id)}
      className={`group flex cursor-pointer items-center justify-between px-4 py-5 text-sm ${
        session.id === activeId ? 'bg-surface' : 'hover:bg-surface'
      }`}
      {...attributes}
      {...listeners}
    >
      <span className="truncate">{session.name}</span>
      <button
        onClick={(e) => onClose(e, session.id)}
        className="text-muted hover:text-text hidden group-hover:block"
      >
        ×
      </button>
    </div>
  );
}

interface TerminalWindowProps {
  profiles: ProfileConfig[];
  activeProfileId: string;
  activeProfileColor: string;
  recentDirectories: RecentDirectories;
  onOpenSettings: () => void;
}

export function TerminalWindow({
  profiles,
  activeProfileId,
  activeProfileColor,
  recentDirectories,
  onOpenSettings,
}: TerminalWindowProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const terminalsRef = useRef<Map<string, SessionTerminal>>(new Map());
  const [newSessionDir, setNewSessionDir] = useState('');
  const [newSessionProfileId, setNewSessionProfileId] = useState(activeProfileId);
  const { t } = useTranslation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sessions.findIndex((s) => s.id === active.id);
    const newIndex = sessions.findIndex((s) => s.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderSessions(oldIndex, newIndex);
      syncSessions();
    }
  }

  // Sync sessions state from module
  const syncSessions = useCallback(() => {
    setSessions(getSessions());
    setActiveId(getActiveSessionId());
  }, []);

  // Create a terminal instance for a session
  function createTerminalForSession(sessionId: string) {
    if (!panelRef.current) return;
    if (terminalsRef.current.has(sessionId)) return;

    const fontSettings = getFontSettings();
    const term = new Terminal({
      fontFamily: fontSettings.fontFamily,
      fontSize: fontSettings.fontSize,
      theme: {
        background: '#0F0F0F',
        foreground: '#E5E5E5',
        cursor: '#E5E5E5',
        selectionBackground: '#2A2A2A',
      },
      cursorBlink: true,
      cursorStyle: 'block',
    });

    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);

    // Ctrl+Shift+V to paste, Ctrl+Shift+C to copy
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.shiftKey && e.type === 'keydown') {
        if (e.key === 'V') {
          readText()
            .then((t) => {
              if (t) term.paste(t);
            })
            .catch(console.error);
          return false;
        }
        if (e.key === 'C') {
          const s = term.getSelection();
          if (s) {
            writeText(s).catch(console.error);
            return false;
          }
        }
      }
      return true;
    });

    const container = document.createElement('div');
    container.className = 'absolute inset-0 overflow-hidden px-2 py-2';
    container.style.display = 'none';
    panelRef.current.appendChild(container);

    term.open(container);

    // Right-click: copy if selection, paste if not
    term.element?.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      const selection = term.getSelection();
      if (selection) {
        writeText(selection).catch(console.error);
      } else {
        readText()
          .then((text) => {
            if (text) term.paste(text);
          })
          .catch(console.error);
      }
    });

    // Register output writer — PTY output for this session writes to this terminal
    registerSessionWriter(sessionId, (data: string) => {
      term.write(data);
    });

    // Handle input — send keystrokes to Rust for this specific session
    term.onData((data) => {
      if (getExitedSessionId() === sessionId) {
        setExitedSessionId(null);
        closeSession(sessionId).catch(console.error);
        removeSession(sessionId);
        disposeTerminal(sessionId);
        syncSessions();
        return;
      }
      writeToSession(sessionId, data).catch(console.error);
    });

    terminalsRef.current.set(sessionId, { terminal: term, fitAddon, container });
    registerTerminal(sessionId, term);
  }

  // Dispose a session's terminal instance
  function disposeTerminal(sessionId: string) {
    const st = terminalsRef.current.get(sessionId);
    if (st) {
      unregisterSessionWriter(sessionId);
      unregisterTerminal(sessionId);
      st.terminal.dispose();
      st.container.remove();
      terminalsRef.current.delete(sessionId);
    }
  }

  // Show the terminal for the active session, hide all others
  function showTerminal(sessionId: string | null) {
    for (const [id, st] of terminalsRef.current) {
      st.container.style.display = id === sessionId ? 'block' : 'none';
    }
    if (sessionId) {
      const st = terminalsRef.current.get(sessionId);
      if (st) {
        requestAnimationFrame(() => {
          st.fitAddon.fit();
          st.terminal.focus();
          const dims = st.fitAddon.proposeDimensions();
          if (dims) {
            resizeSession(sessionId, dims.cols, dims.rows).catch(console.error);
          }
        });
      }
    }
  }

  // Init: start output listener, discover existing sessions
  useEffect(() => {
    startOutputListener();

    const exitUnlisten = listen<{ session_id: string; cwd: string }>('session-exited', (event) => {
      const { session_id: id, cwd } = event.payload;
      setExitedSessionId(id);
      const st = terminalsRef.current.get(id);
      if (st) {
        st.terminal.write(
          `\r\n\x1b[90m${t('terminal.pressEscToClose')} / ${t('terminal.pressEnterToNewSession')}\x1b[0m `,
        );
        const handler = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setExitedSessionId(null);
            closeSession(id).catch(console.error);
            removeSession(id);
            disposeTerminal(id);
            syncSessions();
            return false;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            setExitedSessionId(null);
            setNewSessionDir(cwd);
            setShowNewSession(true);
            closeSession(id).catch(console.error);
            removeSession(id);
            disposeTerminal(id);
            syncSessions();
            return false;
          }
          // Block all other keys — don't close
          return false;
        };
        st.terminal.attachCustomKeyEventHandler(handler);
      }
    });

    const fontUnlisten = listen<{ font_family: string; font_size: number }>(
      'terminal-font-changed',
      (event) => {
        applyFontToAllTerminals({
          fontFamily: event.payload.font_family,
          fontSize: event.payload.font_size,
        });
      },
    );

    listSessions()
      .then((existing) => {
        for (const s of existing) {
          addSession(s);
          createTerminalForSession(s.id);
        }
        if (existing.length > 0 && !getActiveSessionId()) {
          setActiveSessionId(existing[0].id);
        }
        syncSessions();
      })
      .catch(console.error);

    const terminals = terminalsRef.current;
    return () => {
      stopOutputListener();
      exitUnlisten.then((fn) => fn());
      fontUnlisten.then((fn) => fn());
      for (const st of terminals.values()) {
        st.terminal.dispose();
      }
      terminals.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show/hide terminals when activeId changes
  useEffect(() => {
    showTerminal(activeId);
  }, [activeId]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (activeId) {
        const st = terminalsRef.current.get(activeId);
        if (st) {
          st.fitAddon.fit();
          const dims = st.fitAddon.proposeDimensions();
          if (dims) {
            resizeSession(activeId, dims.cols, dims.rows).catch(console.error);
          }
        }
      }
    };

    const observer = new ResizeObserver(handleResize);
    if (panelRef.current) {
      observer.observe(panelRef.current);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [activeId]);

  async function handleNewSession() {
    if (!newSessionProfileId) return;
    try {
      const result = await createSession(newSessionProfileId, newSessionDir);
      addSession({ id: result.session_id, name: result.name, cwd: result.cwd });
      setActiveSessionId(result.session_id);
      setActiveId(result.session_id);
      setShowNewSession(false);
      syncSessions();

      createTerminalForSession(result.session_id);
      showTerminal(result.session_id);

      setTimeout(() => {
        const st = terminalsRef.current.get(result.session_id);
        if (st) {
          st.fitAddon.fit();
          const dims = st.fitAddon.proposeDimensions();
          if (dims) {
            resizeSession(result.session_id, dims.cols, dims.rows).catch(console.error);
          }
        }
      }, 50);
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  }

  function handleSelectSession(id: string) {
    setActiveSessionId(id);
    setActiveId(id);
    syncSessions();
  }

  async function handleCloseSession(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await closeSession(id);
      removeSession(id);
      disposeTerminal(id);
      syncSessions();
    } catch (e) {
      console.error('Failed to close session:', e);
    }
  }

  return (
    <div className="bg-app flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <div className="border-border flex w-60 flex-col border-r">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-muted-foreground text-sm">{t('terminal.sessions')}</span>
          <Button
            onClick={() => setShowNewSession(true)}
            title={t('terminal.newSession')}
            size="icon"
            variant="ghost"
          >
            <PlusIcon />
          </Button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-muted-foreground px-4 py-8 text-center text-sm">
              <div>{t('terminal.noSessions')}</div>
              <div className="mt-1 text-xs">{t('terminal.noSessionsHint')}</div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sessions.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {sessions.map((session) => (
                  <SortableSession
                    key={session.id}
                    session={session}
                    activeId={activeId}
                    activeProfileColor={activeProfileColor}
                    onSelect={handleSelectSession}
                    onClose={handleCloseSession}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Bottom bar */}
        <div className="border-border border-t p-2">
          <Button onClick={onOpenSettings} variant="ghost" className="w-full">
            <SettingsIcon />
            {t('tray.settings')}
          </Button>
        </div>
      </div>

      {/* Terminal panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* New session dialog */}
        <Dialog open={showNewSession} onOpenChange={setShowNewSession}>
          <DialogContent showCloseButton={false} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('terminal.newSession')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground text-xs">{t('terminal.profile')}</label>
                <Select value={newSessionProfileId} onValueChange={setNewSessionProfileId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('terminal.profileId')} />
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
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground text-xs">{t('terminal.directory')}</label>
                <DirectoryCombobox
                  directories={recentDirectories}
                  value={newSessionDir}
                  onChange={setNewSessionDir}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewSession(false)}>
                {t('terminal.cancel')}
              </Button>
              <Button onClick={handleNewSession}>{t('terminal.start')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Terminal container — holds per-session xterm instances */}
        <div
          ref={panelRef}
          className="bg-app relative flex-1 overflow-hidden"
          style={{ display: activeId ? 'block' : 'none' }}
        />

        {/* Empty state */}
        {!activeId && !showNewSession && (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
            {t('terminal.selectSession')}
          </div>
        )}
      </div>
    </div>
  );
}
