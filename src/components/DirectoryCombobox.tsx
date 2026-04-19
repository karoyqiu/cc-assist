import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Combobox, CommandItem } from '@/components/ui/combobox';

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
    setOpen(false);
    try {
      const dir = await invoke<string | null>('pick_directory');
      if (dir !== null) {
        onChange(dir);
      }
    } catch (e) {
      console.error('pick_directory failed:', e);
    }
  }

  return (
    <Combobox
      value={value}
      onValueChange={(val) => {
        if (val !== value) {
          onChange(val);
        }
      }}
      open={open}
      onOpenChange={setOpen}
      placeholder={t('terminal.directory')}
      trigger={
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full truncate px-3 py-2 text-left font-mono text-xs hover:bg-accent"
        >
          {value || t('terminal.directory')}
        </button>
      }
    >
      {directories.length === 0 ? (
        <div className="py-2 px-3 text-xs text-muted-foreground">
          {t('directoryPicker.noRecentDirectories')}
        </div>
      ) : (
        <>
          {directories.map((dir) => (
            <CommandItem
              key={dir}
              value={dir}
              onSelect={() => {
                onChange(dir);
                setOpen(false);
              }}
            >
              {dir}
            </CommandItem>
          ))}
          <CommandItem value="__browse__" onSelect={handleBrowse}>
            {browseLabel}
          </CommandItem>
        </>
      )}
    </Combobox>
  );
}
