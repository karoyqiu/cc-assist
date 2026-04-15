import { invoke } from '@tauri-apps/api/core';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';

interface DirectoryComboboxProps {
  directories: string[];
  value: string;
  onChange: (value: string) => void;
}

export function DirectoryCombobox({ directories, value, onChange }: DirectoryComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = directories;

  // All items: filtered dirs + browse
  const browseLabel = t('directoryPicker.browse');
  const totalItems = filtered.length + 1;

  function resetHighlight() {
    setHighlightedIndex(-1);
  }

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
    resetHighlight();
  }

  function selectItem(index: number) {
    if (index < filtered.length) {
      onChange(filtered[index]);
    } else {
      handleBrowse();
      return;
    }
    setOpen(false);
    resetHighlight();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex((i) => (i + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && highlightedIndex >= 0) {
        selectItem(highlightedIndex);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      resetHighlight();
    }
  }

  function handleFocus() {
    setOpen(true);
    resetHighlight();
  }

  function handleBlur(e: React.FocusEvent) {
    // Keep open if clicking inside the dropdown
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    resetHighlight();
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
          resetHighlight();
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={t('terminal.directory')}
        className="w-full font-mono text-sm"
      />
      {open && totalItems > 0 && (
        <div className="border-subtle bg-surface absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border py-1 shadow-lg">
          {filtered.map((dir, i) => (
            <div
              key={dir}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectItem(i)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`cursor-pointer truncate px-2.5 py-1.5 font-mono text-xs ${
                i === highlightedIndex ? 'bg-hover text-primary' : 'text-muted-foreground'
              }`}
            >
              {dir}
            </div>
          ))}
          <div
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectItem(filtered.length)}
            onMouseEnter={() => setHighlightedIndex(filtered.length)}
            className={`cursor-pointer px-2.5 py-1.5 text-xs ${
              highlightedIndex === filtered.length
                ? 'bg-hover text-primary'
                : 'text-muted-foreground'
            }`}
          >
            {browseLabel}
          </div>
        </div>
      )}
    </div>
  );
}
