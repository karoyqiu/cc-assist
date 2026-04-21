import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from './ui/button';

interface Session {
  session_id: string;
  name: string;
  state: string;
  last_used_at?: string;
  message_count?: number;
  checked?: boolean;
}

export function SessionManagement() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    invoke<Session[]>('chat_list_sessions').then(setSessions).catch(console.error);
  }, []);

  async function handleResume(sessionId: string) {
    await invoke('chat_resume_session', { sessionId });
  }

  async function handleDeleteSelected() {
    const ids = sessions.filter((s) => s.checked).map((s) => s.session_id);
    await invoke('chat_delete_sessions', { sessionIds: ids });
    setSessions((prev) => prev.filter((s) => !s.checked));
  }

  async function handleDeleteOutdated() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const outdated = sessions.filter(
      (s) => s.last_used_at && new Date(s.last_used_at).getTime() < cutoff,
    );
    await invoke('chat_delete_sessions', { sessionIds: outdated.map((s) => s.session_id) });
    setSessions((prev) => prev.filter((s) => !outdated.some((o) => o.session_id === s.session_id)));
  }

  async function handleDeleteSmall() {
    const small = sessions.filter((s) => (s.message_count ?? 0) < 5);
    await invoke('chat_delete_sessions', { sessionIds: small.map((s) => s.session_id) });
    setSessions((prev) => prev.filter((s) => !small.some((sm) => sm.session_id === s.session_id)));
  }

  const filtered = sessions.filter((s) => !filter || s.name.includes(filter));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-2">
        <input
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        {filtered.map((s) => (
          <div key={s.session_id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.checked ?? false}
              onChange={(e) => {
                setSessions((prev) =>
                  prev.map((ses) =>
                    ses.session_id === s.session_id ? { ...ses, checked: e.target.checked } : ses,
                  ),
                );
              }}
            />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-muted-foreground text-xs">{s.last_used_at}</span>
            <button
              onClick={() => handleResume(s.session_id)}
              className="text-xs text-blue-400 cursor-pointer"
            >
              Resume
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleDeleteSelected}>Delete Selected</Button>
        <Button size="sm" variant="outline" onClick={handleDeleteOutdated}>Delete Old</Button>
        <Button size="sm" variant="outline" onClick={handleDeleteSmall}>Delete Small</Button>
      </div>
    </div>
  );
}