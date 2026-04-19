import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DirectoryComboboxProps {
  directories: string[];
  value: string;
  onChange: (value: string) => void;
}

export function DirectoryCombobox({ directories, value, onChange }: DirectoryComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const browseLabel = t('directoryPicker.browse');

  async function handleBrowse() {
    try {
      const dir = await invoke<string | null>('pick_directory');
      if (dir) {
        onChange(dir);
      }
    } catch (e) {
      console.error('pick_directory failed:', e);
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild className="w-full">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('terminal.directory')}
          className="w-full font-mono text-sm"
        />
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start" sideOffset={4}>
        <div className="flex flex-col">
          {directories.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">
              {t('directoryPicker.noRecentDirectories')}
            </div>
          ) : (
            <>
              {directories.map((dir) => (
                <button
                  key={dir}
                  onClick={() => {
                    onChange(dir);
                    setOpen(false);
                  }}
                  className="cursor-pointer truncate px-3 py-2 text-left font-mono text-xs hover:bg-accent"
                >
                  {dir}
                </button>
              ))}
            </>
          )}
          <button
            onClick={handleBrowse}
            className="cursor-pointer border-t px-3 py-2 text-left text-xs hover:bg-accent"
          >
            {browseLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
