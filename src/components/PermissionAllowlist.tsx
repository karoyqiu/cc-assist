import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from './ui/button';

interface AllowlistEntry {
  command: string;
  approved_at: string;
  approved_count: number;
}

export function PermissionAllowlist() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);

  useEffect(() => {
    invoke<AllowlistEntry[]>('chat_get_allowlist').then(setEntries).catch(console.error);
  }, []);

  async function handleRemove(command: string) {
    await invoke('chat_remove_from_allowlist', { command });
    setEntries((prev) => prev.filter((e) => e.command !== command));
  }

  async function handleClear() {
    await invoke('chat_clear_allowlist');
    setEntries([]);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-sm font-medium">Allowed Commands</div>
      <div className="flex flex-col gap-1">
        {entries.map((e) => (
          <div key={e.command} className="flex items-center justify-between text-sm">
            <span>{e.command}</span>
            <span className="text-muted-foreground text-xs">{e.approved_count}x</span>
            <button
              onClick={() => handleRemove(e.command)}
              className="text-muted-foreground cursor-pointer ml-2"
            >
              x
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-muted-foreground text-sm">No allowed commands yet</div>
        )}
      </div>
      {entries.length > 0 && (
        <Button variant="outline" size="sm" onClick={handleClear}>
          Clear All
        </Button>
      )}
    </div>
  );
}