import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Input } from '@/components/ui/input';

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
    } catch (e: unknown) {
      console.error('pick_directory failed:', e);
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        className="w-full"
        render={
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('terminal.directory')}
            className="w-full font-mono text-sm"
          />
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" sideOffset={4} align="start" className="z-50">
          <PopoverPrimitive.Popup className="w-[400px] rounded-lg bg-popover p-0 text-popover-foreground shadow-md ring-1 ring-foreground/10">
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
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
