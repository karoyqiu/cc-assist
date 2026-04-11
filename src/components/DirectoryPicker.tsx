import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { cn } from '../lib/utils';

interface Props {
  recentDirectories: string[];
  accentColor: string;
  onLaunch: (directory: string) => void;
  onCancel: () => void;
}

export function DirectoryPicker({ recentDirectories, accentColor, onLaunch, onCancel }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  async function handleBrowse() {
    try {
      const dir = await invoke<string | null>('pick_directory');
      if (dir) {
        setSelected(dir);
      }
    } catch (e: unknown) {
      console.error('pick_directory failed:', e);
    }
  }

  async function handleLaunch() {
    if (!selected || launching) return;
    setLaunching(true);
    try {
      await onLaunch(selected);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent
        className="border-subtle bg-surface flex max-h-[80vh] w-128 flex-col overflow-hidden"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="border-subtle flex flex-row items-center justify-between border-b px-4 pt-4 pb-3">
          <DialogTitle className="text-primary text-base font-semibold">
            {t('directoryPicker.title')}
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Recent directories */}
          <div className="mb-3">
            <div className="text-muted mb-1.5 text-xs font-medium tracking-[0.08em] uppercase">
              {t('directoryPicker.recentDirectories')}
            </div>
            {recentDirectories.length === 0 ? (
              <div className="text-muted py-2 text-sm">
                {t('directoryPicker.noRecentDirectories')}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {recentDirectories.map((dir) => (
                  <div
                    key={dir}
                    onClick={() => setSelected(dir)}
                    className={cn(
                      'cursor-pointer overflow-hidden rounded px-2 py-1.5 font-mono text-xs',
                      'text-ellipsis whitespace-nowrap',
                      selected === dir
                        ? 'bg-subtle text-primary'
                        : 'bg-transparent text-muted hover:bg-hover',
                    )}
                  >
                    {dir}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected path display */}
          {selected && (
            <div className="border-subtle bg-app text-primary overflow-hidden rounded border p-2 font-mono text-xs text-ellipsis whitespace-nowrap">
              {selected}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-subtle flex flex-row items-center justify-between border-t px-4 py-3">
          <Button
            variant="outline"
            onClick={handleBrowse}
            className="text-primary"
          >
            {t('directoryPicker.browse')}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              className="text-muted"
            >
              {t('directoryPicker.cancel')}
            </Button>
            <Button
              onClick={handleLaunch}
              disabled={!selected || launching}
              className={cn(
                selected ? 'text-app cursor-pointer' : 'cursor-not-allowed text-muted',
              )}
              style={{ backgroundColor: selected ? accentColor : undefined }}
            >
              {t('directoryPicker.launch')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
