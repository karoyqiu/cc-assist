import { useEffect, useRef, useState, useMemo } from 'react';
import { getSystemFonts } from 'tauri-plugin-system-fonts-api';

import { Input } from '@/components/ui/input';

interface FontComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function FontCombobox({ value, onChange, placeholder }: FontComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [monospaceFonts, setMonospaceFonts] = useState<string[]>([]);
  const [inputText, setInputText] = useState(value);
  const committedRef = useRef(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  if (value !== committedRef.current) {
    committedRef.current = value;
    setInputText(value);
  }

  useEffect(() => {
    let cancelled = false;
    getSystemFonts()
      .then((fonts) => {
        if (cancelled) return;
        const mono = fonts
          .filter((f) => f.monospaced)
          .map((f) => f.name)
          .sort((a, b) => a.localeCompare(b));
        const unique = [...new Set(mono)];
        if (!unique.includes('monospace')) unique.unshift('monospace');
        setMonospaceFonts(unique);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    // When input matches the committed value (user hasn't typed anything new),
    // show all fonts — the value might be a CSS font-family list that won't
    // match any single font name.
    if (inputText === committedRef.current && inputText.includes(',')) {
      return monospaceFonts;
    }
    if (!inputText) return monospaceFonts;
    const lower = inputText.toLowerCase();
    return monospaceFonts.filter((f) => f.toLowerCase().includes(lower));
  }, [inputText, monospaceFonts]);

  const totalItems = filtered.length;

  function resetHighlight() {
    setHighlightedIndex(-1);
  }

  function selectItem(index: number) {
    if (index >= 0 && index < filtered.length) {
      const font = filtered[index];
      committedRef.current = font;
      setInputText(font);
      onChange(font);
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
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    // Commit whatever is in the input
    committedRef.current = inputText;
    onChange(inputText);
    setOpen(false);
    resetHighlight();
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={inputText}
        onChange={(e) => {
          setInputText(e.target.value);
          if (!open) setOpen(true);
          resetHighlight();
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full font-mono text-sm"
      />
      {open && totalItems > 0 && (
        <div className="border-border bg-card absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border py-1 shadow-lg">
          {filtered.map((font, i) => (
            <div
              key={font}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectItem(i)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`cursor-pointer truncate px-2.5 py-1.5 font-mono text-xs ${
                i === highlightedIndex ? 'bg-accent text-primary' : 'text-muted-foreground'
              }`}
            >
              {font}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
