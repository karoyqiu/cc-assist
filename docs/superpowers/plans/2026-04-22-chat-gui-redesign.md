# Chat GUI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the main Tauri window with an assistant-ui chat GUI; split every top-level window into its own HTML entry + XxxApp component; add inline permission/question cards, compact button, permission allowlist, and settings tabs for allowlist + session management.

**Architecture:** Three windows (chat=`main`, terminal=`terminal`, settings=`settings`), each owns its HTML entry file and a dedicated `XxxApp` React component. Chat panel mirrors the assistant-ui `claude.tsx` reference adapted to project CSS variables and system-ui font. A `TauriChatModelAdapter` bridges assistant-ui's `ChatModelAdapter` interface to Rust cc-sdk via Tauri `invoke()` + event listeners. Permission allowlist persisted as JSON under `app_data_dir`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, `@assistant-ui/react ^0.12`, `@radix-ui/react-icons ^1`, `zustand ^5`, `react-markdown ^10`, Tauri 2, Rust, `cc-sdk 0.8.1`

**Working directory:** All commands run from `.worktrees/feature/chat-gui-redesign/`

---

## File Map

### New files
| Path | Responsibility |
|------|---------------|
| `terminal.html` | Vite HTML entry for terminal window |
| `src/terminal.tsx` | React entry point for terminal window |
| `src/TerminalWindowApp.tsx` | Extracted from `App.tsx` |
| `src/SettingsApp.tsx` | Extracted from `App.tsx` |
| `src/ChatApp.tsx` | Chat window root — runtime + layout |
| `src/components/assistant-ui/markdown-text.tsx` | Markdown renderer for messages |
| `src/components/chat/ChatWindow.tsx` | Sidebar + chat panel flex layout |
| `src/components/chat/SessionList.tsx` | Sidebar session list |
| `src/components/chat/ChatPanel.tsx` | Thread + composer + status bar column |
| `src/components/chat/ChatMessage.tsx` | User and assistant message rendering |
| `src/components/chat/Composer.tsx` | Input card with attachment/compact/model/send |
| `src/components/chat/ModelSelector.tsx` | Per-session model dropdown |
| `src/components/chat/StatusBar.tsx` | Footer strip — ctx/sub/git + mode + state |
| `src/components/chat/PermissionRequestCard.tsx` | Inline permission request card |
| `src/components/chat/UserQuestionCard.tsx` | Inline user question card with choices |
| `src/lib/chatCommands.ts` | Typed `invoke()` wrappers for chat commands |
| `src/lib/TauriChatModelAdapter.ts` | `ChatModelAdapter` implementation |
| `src-tauri/src/commands_chat.rs` | Tauri command handlers for chat |
| `src-tauri/src/permission_allowlist.rs` | Allowlist JSON persistence + cd-prefix matching |

### Modified files
| Path | Change |
|------|--------|
| `src/main.tsx` | Render `ChatApp` |
| `src/settings.tsx` | Import `SettingsApp` from `./SettingsApp` |
| `src/App.tsx` | **Delete** |
| `src/App.css` | Keep as-is |
| `vite.config.ts` | Add `terminal` rollup entry |
| `index.html` | No changes needed |
| `src-tauri/tauri.conf.json` | Resize main → 1000×700; add terminal window |
| `src-tauri/src/lib.rs` | Add `commands_chat` module; register chat commands; add allowlist to state |
| `src-tauri/src/chat.rs` | Add `send_message`, streaming, compact, session list |
| `src-tauri/src/state.rs` | Add `AllowlistEntry`, `PermissionAllowlist` to `AppState` |
| `src-tauri/src/window.rs` | Add `TERMINAL_LABEL`, `show_terminal_window`, `toggle_terminal_window` |
| `src-tauri/src/tray.rs` | Add `ID_OPEN_CHAT`, `ID_OPEN_TERMINAL`; update menu + handler |
| `package.json` | Add `@assistant-ui/react`, `@radix-ui/react-icons`, `zustand`, `react-markdown` |

---

## Task 1: Install frontend dependencies

**Files:** `package.json`

- [ ] **Install packages**

```bash
pnpm add @assistant-ui/react @radix-ui/react-icons zustand react-markdown
```

- [ ] **Verify type-check passes**

```bash
pnpm tsc --noEmit
```

Expected: no errors (packages added, nothing using them yet).

- [ ] **Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add assistant-ui, radix-icons, zustand, react-markdown"
```

---

## Task 2: Extract TerminalWindowApp and SettingsApp

**Files:**
- Create: `src/TerminalWindowApp.tsx`
- Create: `src/SettingsApp.tsx`
- Delete: `src/App.tsx`

- [ ] **Create `src/TerminalWindowApp.tsx`** — copy the `TerminalWindowApp` export from `src/App.tsx` verbatim, adjusting imports:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import '../lib/i18n';
import type { ProfilesStore } from '../types';

import '../App.css';
import { TerminalWindow } from './TerminalWindow';
import { setFontSettings } from '../lib/terminal';

export function TerminalWindowApp() {
  const { i18n } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);

  useEffect(() => {
    invoke<ProfilesStore>('get_config').then((s) => {
      setStore(s);
      setFontSettings({ fontFamily: s.terminal_font_family, fontSize: s.terminal_font_size });
      return i18n.changeLanguage(s.locale);
    });
  }, [i18n]);

  useEffect(() => {
    const unlisten = listen<string>('locale-changed', async (event) => {
      await i18n.changeLanguage(event.payload);
      setStore((s) => (s ? { ...s, locale: event.payload } : s));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [i18n]);

  useEffect(() => {
    const unlisten = listen('profiles-changed', async () => {
      const s = await invoke<ProfilesStore>('get_config');
      setStore(s);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    getCurrentWindow().show().catch(console.error);
  }, []);

  if (!store) return null;

  return (
    <TerminalWindow
      profiles={store.profiles}
      activeProfileId={store.active_profile_id}
      recentDirectories={store.recent_directories}
      onOpenSettings={() => invoke('toggle_settings_window')}
    />
  );
}
```

- [ ] **Create `src/SettingsApp.tsx`** — copy the `SettingsApp` export from `src/App.tsx` verbatim, adjusting imports to use relative paths (`../types`, `../lib/i18n`, etc.) and component paths.

- [ ] **Delete `src/App.tsx`**

```bash
rm src/App.tsx
```

- [ ] **Update `src/main.tsx`** to import a placeholder `ChatApp`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../src/lib/i18n';

// Placeholder — replaced in Task 8
function ChatApp() {
  return <div className="bg-background text-foreground flex h-screen w-screen items-center justify-center text-sm">Chat coming soon</div>;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChatApp />
  </React.StrictMode>,
);
```

- [ ] **Update `src/settings.tsx`** to import from new path:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { SettingsApp } from './SettingsApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>,
);
```

- [ ] **Type-check**

```bash
pnpm tsc --noEmit
```

- [ ] **Lint**

```bash
pnpm oxlint src/TerminalWindowApp.tsx src/SettingsApp.tsx src/main.tsx src/settings.tsx
```

- [ ] **Commit**

```bash
git add src/TerminalWindowApp.tsx src/SettingsApp.tsx src/main.tsx src/settings.tsx
git rm src/App.tsx
git commit -m "refactor: extract TerminalWindowApp and SettingsApp to own files"
```

---

## Task 3: Add terminal HTML entry and Vite config

**Files:**
- Create: `terminal.html`
- Create: `src/terminal.tsx`
- Modify: `vite.config.ts`

- [ ] **Create `terminal.html`** (copy `settings.html`, change title and entry):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CC Assist — Terminal</title>
  </head>
  <body class="dark">
    <div id="root"></div>
    <script type="module" src="/src/terminal.tsx"></script>
  </body>
</html>
```

- [ ] **Create `src/terminal.tsx`**:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { TerminalWindowApp } from './TerminalWindowApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TerminalWindowApp />
  </React.StrictMode>,
);
```

- [ ] **Update `vite.config.ts`** — add `terminal` to rollup inputs:

```typescript
build: {
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'index.html'),
      settings: resolve(__dirname, 'settings.html'),
      terminal: resolve(__dirname, 'terminal.html'),
    },
  },
},
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/terminal.tsx
```

- [ ] **Commit**

```bash
git add terminal.html src/terminal.tsx vite.config.ts
git commit -m "feat: add terminal window HTML entry and Vite config"
```

---

## Task 4: Update Tauri window config and Rust window/tray

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/window.rs`
- Modify: `src-tauri/src/tray.rs`

- [ ] **Update `src-tauri/tauri.conf.json`** windows array:

```json
"windows": [
  {
    "title": "CC Assist",
    "label": "main",
    "width": 1000,
    "height": 700,
    "resizable": true,
    "center": true,
    "visible": false,
    "minWidth": 600,
    "minHeight": 400
  },
  {
    "title": "CC Assist — Terminal",
    "label": "terminal",
    "width": 800,
    "height": 600,
    "resizable": true,
    "center": true,
    "visible": false,
    "minWidth": 400,
    "minHeight": 300,
    "create": false,
    "url": "terminal.html"
  },
  {
    "title": "CC Assist — Settings",
    "label": "settings",
    "width": 700,
    "height": 500,
    "resizable": true,
    "center": true,
    "visible": false,
    "minWidth": 500,
    "minHeight": 300,
    "create": false,
    "url": "settings.html"
  }
]
```

- [ ] **Update `src-tauri/src/window.rs`** — add terminal window support:

```rust
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const MAIN_LABEL: &str = "main";
const SETTINGS_LABEL: &str = "settings";
const TERMINAL_LABEL: &str = "terminal";

// show_main_window — unchanged, shows chat window

// Keep show_settings_window unchanged

/// Show the terminal window, creating it if needed.
pub fn show_terminal_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(TERMINAL_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let window_config = app.config().app.windows.iter().find(|w| w.label == TERMINAL_LABEL);
    let builder = match window_config {
        Some(config) => WebviewWindowBuilder::from_config(app, config)
            .unwrap_or_else(|_| WebviewWindowBuilder::new(app, TERMINAL_LABEL, WebviewUrl::App("terminal.html".into()))),
        None => WebviewWindowBuilder::new(app, TERMINAL_LABEL, WebviewUrl::App("terminal.html".into())),
    };
    if let Err(e) = builder.build() {
        log::error!("Failed to create terminal window: {}", e);
    }
}

/// Toggle the main (chat) window.
pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        match window.is_visible() {
            Ok(true) => { let _ = window.close(); }
            Ok(false) | Err(_) => { let _ = window.show(); let _ = window.set_focus(); }
        }
    } else {
        show_main_window(app);
    }
}
```

- [ ] **Update `src-tauri/src/tray.rs`** — add Open Chat + Open Terminal items:

Add constants:
```rust
const ID_OPEN_CHAT: &str = "open-chat";
const ID_OPEN_TERMINAL: &str = "open-terminal";
```

Update `TrayStrings` struct and `tray_strings()` to include `open_chat` field:
```rust
struct TrayStrings {
    settings: &'static str,
    open_chat: &'static str,
    open_terminal: &'static str,
    lang_en: &'static str,
    lang_zh: &'static str,
    quit: &'static str,
}
// en: open_chat: "Open Chat", open_terminal: "Open Terminal"
// zh: open_chat: "打开聊天", open_terminal: "打开终端"
```

Update `build_tray_menu` to add both items before Settings:
```rust
MenuItemBuilder::with_id(ID_OPEN_CHAT, strings.open_chat).build(app)?,
MenuItemBuilder::with_id(ID_OPEN_TERMINAL, strings.open_terminal).build(app)?,
```

Update `handle_menu_event`:
```rust
ID_OPEN_CHAT => window::show_main_window(app),
ID_OPEN_TERMINAL => window::show_terminal_window(app),
```

- [ ] **Build check**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml
```

- [ ] **Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/src/window.rs src-tauri/src/tray.rs
git commit -m "feat: add terminal window; rename main to chat in tray menu"
```

---

## Task 5: Create MarkdownText component

**Files:**
- Create: `src/components/assistant-ui/markdown-text.tsx`

- [ ] **Create `src/components/assistant-ui/markdown-text.tsx`**:

```typescript
import ReactMarkdown from 'react-markdown';
import { useMessage } from '@assistant-ui/react';

export function MarkdownText() {
  const text = useMessage((m) => {
    const part = m.content.find((p) => p.type === 'text');
    return part?.type === 'text' ? part.text : '';
  });

  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-');
          return isBlock ? (
            <pre className="bg-muted rounded-md overflow-x-auto p-3 my-2 text-xs font-mono">
              <code>{children}</code>
            </pre>
          ) : (
            <code className="bg-muted rounded px-1 py-0.5 text-xs font-mono">{children}</code>
          );
        },
        ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/components/assistant-ui/markdown-text.tsx
```

- [ ] **Commit**

```bash
git add src/components/assistant-ui/markdown-text.tsx
git commit -m "feat(chat): add MarkdownText component"
```

---

## Task 6: Create ChatMessage component

**Files:**
- Create: `src/components/chat/ChatMessage.tsx`

- [ ] **Create `src/components/chat/ChatMessage.tsx`**:

```typescript
import {
  ActionBarPrimitive,
  AuiIf,
  AttachmentPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react';
import { ClipboardIcon, Pencil1Icon, ReloadIcon } from '@radix-ui/react-icons';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { type FC } from 'react';
import { MarkdownText } from '../assistant-ui/markdown-text';

const actionBtnClass =
  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] hover:bg-transparent active:scale-95';

export const ChatMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group relative mx-auto mt-1 mb-1 block w-full max-w-3xl">
      <AuiIf condition={(s) => s.message.role === 'user'}>
        <div className="group/user relative inline-flex max-w-[75ch] flex-col gap-2 rounded-xl bg-muted py-2.5 pr-6 pl-2.5 text-foreground transition-all">
          <div className="relative flex flex-row gap-2">
            <div className="shrink-0 self-start">
              <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                U
              </div>
            </div>
            <div className="flex-1">
              <div className="relative grid grid-cols-1 gap-2 py-0.5">
                <div className="wrap-break-word whitespace-pre-wrap">
                  <MessagePrimitive.Parts>
                    {({ part }) => {
                      if (part.type === 'text') return <MarkdownText />;
                      return null;
                    }}
                  </MessagePrimitive.Parts>
                </div>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute right-2 bottom-0">
            <ActionBarPrimitive.Root
              autohide="not-last"
              className="pointer-events-auto min-w-max translate-x-1 translate-y-4 rounded-lg border border-border bg-card/80 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition group-hover/user:translate-x-0.5 group-hover/user:opacity-100"
            >
              <div className="flex items-center text-muted-foreground">
                <ActionBarPrimitive.Reload className={actionBtnClass}>
                  <ReloadIcon width={16} height={16} />
                </ActionBarPrimitive.Reload>
                <ActionBarPrimitive.Edit className={actionBtnClass}>
                  <Pencil1Icon width={16} height={16} />
                </ActionBarPrimitive.Edit>
              </div>
            </ActionBarPrimitive.Root>
          </div>
        </div>
      </AuiIf>

      <AuiIf condition={(s) => s.message.role === 'assistant'}>
        <div className="relative mb-12">
          <div className="relative leading-[1.65rem]">
            <div className="grid grid-cols-1 gap-2.5">
              <div className="wrap-break-word whitespace-normal pr-8 pl-2 text-foreground">
                <MessagePrimitive.Parts>
                  {({ part }) => {
                    if (part.type === 'text') return <MarkdownText />;
                    return null;
                  }}
                </MessagePrimitive.Parts>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0">
            <ActionBarPrimitive.Root
              hideWhenRunning
              autohide="not-last"
              className="pointer-events-auto flex w-full translate-y-full flex-col items-end px-2 pt-2 transition"
            >
              <div className="flex items-center text-muted-foreground">
                <ActionBarPrimitive.Copy className={actionBtnClass}>
                  <ClipboardIcon width={16} height={16} />
                </ActionBarPrimitive.Copy>
                <ActionBarPrimitive.FeedbackPositive className={actionBtnClass}>
                  <ThumbsUp width={14} height={14} />
                </ActionBarPrimitive.FeedbackPositive>
                <ActionBarPrimitive.FeedbackNegative className={actionBtnClass}>
                  <ThumbsDown width={14} height={14} />
                </ActionBarPrimitive.FeedbackNegative>
                <ActionBarPrimitive.Reload className={actionBtnClass}>
                  <ReloadIcon width={16} height={16} />
                </ActionBarPrimitive.Reload>
              </div>
              <AuiIf condition={(s) => s.message.isLast}>
                <p className="mt-2 w-full text-right text-muted-foreground text-xs leading-relaxed opacity-90">
                  Claude can make mistakes. Please double-check responses.
                </p>
              </AuiIf>
            </ActionBarPrimitive.Root>
          </div>
        </div>
      </AuiIf>
    </MessagePrimitive.Root>
  );
};
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/components/chat/ChatMessage.tsx
```

- [ ] **Commit**

```bash
git add src/components/chat/ChatMessage.tsx
git commit -m "feat(chat): add ChatMessage component"
```

---

## Task 7: Create ModelSelector component

**Files:**
- Create: `src/components/chat/ModelSelector.tsx`

- [ ] **Create `src/components/chat/ModelSelector.tsx`**:

```typescript
import { ChevronDownIcon } from '@radix-ui/react-icons';
import { type FC } from 'react';

export interface ModelOption {
  key: string;
  label: string;
}

interface ModelSelectorProps {
  options: ModelOption[];
  value: string;
  onChange: (key: string) => void;
}

export const ModelSelector: FC<ModelSelectorProps> = ({ options, value, onChange }) => {
  const current = options.find((o) => o.key === value) ?? options[0];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-8 cursor-pointer appearance-none items-center gap-1 rounded-md bg-transparent px-2 pr-6 text-foreground text-sm transition hover:bg-muted active:scale-[0.985] focus:outline-none"
      aria-label="Select model"
      style={{ backgroundImage: 'none' }}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
};
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/components/chat/ModelSelector.tsx
```

- [ ] **Commit**

```bash
git add src/components/chat/ModelSelector.tsx
git commit -m "feat(chat): add ModelSelector component"
```

---

## Task 8: Create Composer component

**Files:**
- Create: `src/components/chat/Composer.tsx`

- [ ] **Create `src/components/chat/Composer.tsx`**:

```typescript
import {
  AuiIf,
  AttachmentPrimitive,
  ComposerPrimitive,
  useAuiState,
} from '@assistant-ui/react';
import { ArrowUpIcon, Cross2Icon, PlusIcon, ReloadIcon } from '@radix-ui/react-icons';
import { useEffect, useState, type FC } from 'react';
import { useShallow } from 'zustand/shallow';
import { ModelSelector, type ModelOption } from './ModelSelector';

interface ComposerProps {
  modelOptions: ModelOption[];
  selectedModel: string;
  onModelChange: (key: string) => void;
  onCompact: () => Promise<void>;
}

const toolBtnClass =
  'flex h-8 min-w-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-transparent px-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-[0.98]';

export const Composer: FC<ComposerProps> = ({
  modelOptions,
  selectedModel,
  onModelChange,
  onCompact,
}) => {
  const [compacting, setCompacting] = useState(false);

  async function handleCompact() {
    setCompacting(true);
    try {
      await onCompact();
    } finally {
      setCompacting(false);
    }
  }

  return (
    <ComposerPrimitive.Root className="mx-auto w-full max-w-3xl flex-col rounded-2xl border border-transparent bg-card p-0.5 shadow-[0_0_0_0.5px_hsl(var(--border))] transition-shadow duration-200 focus-within:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.075),0_0_0_0.5px_hsl(var(--border))] hover:shadow-[0_0.25rem_1.25rem_rgba(0,0,0,0.05),0_0_0_0.5px_hsl(var(--border))]">
      <div className="m-3.5 flex flex-col gap-3.5">
        <div className="relative">
          <div className="max-h-96 w-full overflow-y-auto">
            <ComposerPrimitive.Input
              placeholder="How can I help you today?"
              className="block min-h-6 w-full resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  // ComposerPrimitive.Send handles submission via form
                  (e.currentTarget.closest('form') as HTMLFormElement | null)?.requestSubmit();
                }
              }}
            />
          </div>
        </div>
        <div className="flex w-full items-center gap-2">
          <div className="flex min-w-0 flex-1 shrink items-center gap-2">
            <ComposerPrimitive.AddAttachment className={toolBtnClass}>
              <PlusIcon width={16} height={16} />
            </ComposerPrimitive.AddAttachment>
            <button
              type="button"
              onClick={handleCompact}
              disabled={compacting}
              className={toolBtnClass}
              aria-label="Compact conversation"
            >
              <ReloadIcon
                width={16}
                height={16}
                className={compacting ? 'animate-spin' : ''}
              />
            </button>
          </div>
          <ModelSelector
            options={modelOptions}
            value={selectedModel}
            onChange={onModelChange}
          />
          <ComposerPrimitive.Send className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary transition-colors hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:opacity-50">
            <ArrowUpIcon width={16} height={16} className="text-primary-foreground" />
          </ComposerPrimitive.Send>
        </div>
      </div>
      <AuiIf condition={(s) => s.composer.attachments.length > 0}>
        <div className="overflow-hidden rounded-b-2xl">
          <div className="overflow-x-auto rounded-b-2xl border-t border-border bg-muted p-3.5">
            <div className="flex flex-row gap-3">
              <ComposerPrimitive.Attachments>
                {() => <ComposerAttachment />}
              </ComposerPrimitive.Attachments>
            </div>
          </div>
        </div>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== 'image') return {};
      if (s.attachment.file) return { file: s.attachment.file };
      const imageSrc = s.attachment.content?.filter((c) => c.type === 'image')[0]?.image;
      if (!imageSrc) return {};
      return { src: imageSrc };
    }),
  );
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!file) { setObjectUrl(undefined); return; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return objectUrl ?? src;
};

const ComposerAttachment: FC = () => {
  const isImage = useAuiState((s) => s.attachment.type === 'image');
  const src = useAttachmentSrc();

  return (
    <AttachmentPrimitive.Root className="group/thumbnail relative">
      <div
        className="overflow-hidden rounded-lg border border-border shadow-sm hover:shadow-md"
        style={{ width: 120, height: 120, minWidth: 120, minHeight: 120 }}
      >
        <button type="button" className="relative bg-card" style={{ width: 120, height: 120 }}>
          {isImage && src ? (
            <img className="h-full w-full object-cover" alt="Attachment" src={src} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <AttachmentPrimitive.unstable_Thumb className="text-xs" />
            </div>
          )}
        </button>
      </div>
      <AttachmentPrimitive.Remove
        className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground opacity-0 backdrop-blur-sm transition-all hover:bg-card hover:text-foreground group-focus-within/thumbnail:opacity-100 group-hover/thumbnail:opacity-100"
        aria-label="Remove attachment"
      >
        <Cross2Icon width={12} height={12} />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
};
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/components/chat/Composer.tsx
```

- [ ] **Commit**

```bash
git add src/components/chat/Composer.tsx
git commit -m "feat(chat): add Composer component"
```

---

## Task 9: Create StatusBar component

**Files:**
- Create: `src/components/chat/StatusBar.tsx`

- [ ] **Create `src/components/chat/StatusBar.tsx`**:

```typescript
import { type FC } from 'react';
import { cn } from '../../lib/utils';

export type PermissionMode = 'default' | 'auto_accept_edits' | 'plan_mode';
export type SessionState = 'idle' | 'thinking' | 'request_input' | 'request_permission' | 'error';

interface StatusBarProps {
  contextPct: number;
  subscriptionPct: number;
  gitBranch: string;
  gitDirty: boolean;
  permissionMode: PermissionMode;
  sessionState: SessionState;
}

const modeLabel: Record<PermissionMode, string> = {
  default: 'Default',
  auto_accept_edits: 'Auto',
  plan_mode: 'Plan',
};

const modeBadgeClass: Record<PermissionMode, string> = {
  default: 'bg-muted text-muted-foreground',
  auto_accept_edits: 'bg-green-500/20 text-green-600 dark:text-green-400',
  plan_mode: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
};

const stateLabel: Record<SessionState, string> = {
  idle: 'idle',
  thinking: 'thinking',
  request_input: 'waiting',
  request_permission: 'permission',
  error: 'error',
};

export const StatusBar: FC<StatusBarProps> = ({
  contextPct,
  subscriptionPct,
  gitBranch,
  gitDirty,
  permissionMode,
  sessionState,
}) => {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-background px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>ctx: {contextPct}%</span>
        <span>sub: {subscriptionPct}%</span>
        {gitBranch && (
          <span>
            git: {gitBranch}
            {gitDirty ? ' ✗' : ' ✓'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-xs font-medium',
            modeBadgeClass[permissionMode],
          )}
        >
          {modeLabel[permissionMode]}
        </span>
        <span>{stateLabel[sessionState]}</span>
      </div>
    </div>
  );
};
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/components/chat/StatusBar.tsx
```

- [ ] **Commit**

```bash
git add src/components/chat/StatusBar.tsx
git commit -m "feat(chat): add StatusBar component"
```

---

## Task 10: Create PermissionRequestCard and UserQuestionCard

**Files:**
- Create: `src/components/chat/PermissionRequestCard.tsx`
- Create: `src/components/chat/UserQuestionCard.tsx`

- [ ] **Create `src/components/chat/PermissionRequestCard.tsx`**:

```typescript
import { type FC, useState } from 'react';

export interface PermissionRequestPayload {
  sessionId: string;
  toolName: string;
  command: string;
}

interface PermissionRequestCardProps {
  payload: PermissionRequestPayload;
  onAllow: (sessionId: string, toolName: string) => void;
  onAllowAlways: (sessionId: string, toolName: string) => void;
  onDeny: (sessionId: string, toolName: string) => void;
}

export const PermissionRequestCard: FC<PermissionRequestCardProps> = ({
  payload,
  onAllow,
  onAllowAlways,
  onDeny,
}) => {
  const [resolved, setResolved] = useState<'allowed' | 'denied' | null>(null);

  function handle(action: 'allow' | 'allow-always' | 'deny') {
    if (action === 'allow') { onAllow(payload.sessionId, payload.toolName); setResolved('allowed'); }
    else if (action === 'allow-always') { onAllowAlways(payload.sessionId, payload.toolName); setResolved('allowed'); }
    else { onDeny(payload.sessionId, payload.toolName); setResolved('denied'); }
  }

  return (
    <div className="mx-auto my-2 w-full max-w-3xl rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <span>🛡</span>
        <span>Permission Request</span>
      </div>
      <p className="mb-4 font-mono text-xs text-muted-foreground">{payload.command}</p>
      {resolved ? (
        <p className="text-xs text-muted-foreground capitalize">{resolved}</p>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handle('deny')}
            className="rounded-md border border-destructive px-3 py-1.5 text-xs text-destructive transition hover:bg-destructive/10"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => handle('allow')}
            className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground transition hover:bg-muted/80"
          >
            Allow
          </button>
          <button
            type="button"
            onClick={() => handle('allow-always')}
            className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground transition hover:bg-muted/80"
          >
            Allow always
          </button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Create `src/components/chat/UserQuestionCard.tsx`**:

```typescript
import { type FC, useState } from 'react';

interface UserQuestionCardProps {
  sessionId: string;
  question: string;
  choices: string[];
  onAnswer: (sessionId: string, answer: string) => void;
}

export const UserQuestionCard: FC<UserQuestionCardProps> = ({
  sessionId,
  question,
  choices,
  onAnswer,
}) => {
  const [selected, setSelected] = useState<string | null>(null);

  function handleChoice(choice: string) {
    if (selected) return;
    setSelected(choice);
    onAnswer(sessionId, choice);
  }

  return (
    <div className="mx-auto my-2 w-full max-w-3xl rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <span>❓</span>
        <span>Claude asks:</span>
      </div>
      <p className="mb-4 text-sm text-foreground">{question}</p>
      <div className="flex flex-col gap-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={selected !== null}
            onClick={() => handleChoice(choice)}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
              selected === choice
                ? 'border-border bg-muted text-foreground'
                : selected !== null
                  ? 'border-border/50 text-muted-foreground opacity-50'
                  : 'border-border bg-transparent text-foreground hover:bg-muted'
            }`}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit
pnpm oxlint src/components/chat/PermissionRequestCard.tsx src/components/chat/UserQuestionCard.tsx
```

- [ ] **Commit**

```bash
git add src/components/chat/PermissionRequestCard.tsx src/components/chat/UserQuestionCard.tsx
git commit -m "feat(chat): add PermissionRequestCard and UserQuestionCard"
```

---

## Task 11: Create typed chat command wrappers

**Files:**
- Create: `src/lib/chatCommands.ts`

- [ ] **Create `src/lib/chatCommands.ts`**:

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface CreateSessionResult {
  sessionId: string;
  name: string;
  cwd: string;
}

export interface SessionInfo {
  sessionId: string;
  name: string;
  profileId: string;
  state: 'idle' | 'thinking' | 'request_input' | 'request_permission' | 'error';
  cwd: string;
  lastUsedAt: string;
  messageCount: number;
}

export interface AllowlistEntry {
  command: string;
  approvedCount: number;
  lastApprovedAt: string;
}

export const chatCommands = {
  createSession: (profileId: string, directory: string) =>
    invoke<CreateSessionResult>('chat_create_session', { profileId, directory }),

  closeSession: (sessionId: string) =>
    invoke<void>('chat_close_session', { sessionId }),

  sendMessage: (sessionId: string, content: string, attachments?: string[]) =>
    invoke<void>('chat_send_message', { sessionId, content, attachments }),

  listSessions: () =>
    invoke<SessionInfo[]>('chat_list_sessions'),

  deleteSessions: (sessionIds: string[]) =>
    invoke<void>('chat_delete_sessions', { sessionIds }),

  deleteOutdatedSessions: (days: number) =>
    invoke<{ deleted: number }>('chat_delete_outdated_sessions', { days }),

  deleteSmallSessions: (minMessages: number) =>
    invoke<{ deleted: number }>('chat_delete_small_sessions', { minMessages }),

  compact: (sessionId: string) =>
    invoke<void>('chat_compact', { sessionId }),

  setPermissionMode: (sessionId: string, mode: 'default' | 'auto_accept_edits' | 'plan_mode') =>
    invoke<void>('chat_set_permission_mode', { sessionId, mode }),

  allowPermission: (sessionId: string, toolName: string) =>
    invoke<void>('chat_allow_permission', { sessionId, toolName }),

  denyPermission: (sessionId: string, toolName: string) =>
    invoke<void>('chat_deny_permission', { sessionId, toolName }),

  getAllowlist: () =>
    invoke<AllowlistEntry[]>('chat_get_allowlist'),

  removeFromAllowlist: (commands: string[]) =>
    invoke<void>('chat_remove_from_allowlist', { commands }),

  clearAllowlist: () =>
    invoke<void>('chat_clear_allowlist'),

  answerQuestion: (sessionId: string, answer: string) =>
    invoke<void>('chat_answer_question', { sessionId, answer }),
};
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/lib/chatCommands.ts
```

- [ ] **Commit**

```bash
git add src/lib/chatCommands.ts
git commit -m "feat(chat): add typed chat command wrappers"
```

---

## Task 12: Create TauriChatModelAdapter

**Files:**
- Create: `src/lib/TauriChatModelAdapter.ts`

- [ ] **Create `src/lib/TauriChatModelAdapter.ts`**:

```typescript
import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult } from '@assistant-ui/react';
import { listen } from '@tauri-apps/api/event';
import { chatCommands } from './chatCommands';

interface ChatOutputPayload {
  sessionId: string;
  content: string;
  partType: 'text' | 'reasoning' | 'tool_call';
}

interface ResultPayload {
  sessionId: string;
  usage: { contextTokens: number; outputTokens: number } | null;
}

export function createTauriChatModelAdapter(sessionId: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult> {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (!lastUser) return;

      const textPart = lastUser.content.find((p) => p.type === 'text');
      const content = textPart?.type === 'text' ? textPart.text : '';

      let accumulated = '';
      let resolve: (() => void) | null = null;
      const chunks: string[] = [];

      const unlistenOutput = await listen<ChatOutputPayload>('chat-output', (event) => {
        if (event.payload.sessionId !== sessionId) return;
        if (event.payload.partType === 'text') {
          chunks.push(event.payload.content);
          resolve?.();
        }
      });

      const unlistenResult = await listen<ResultPayload>('result', (event) => {
        if (event.payload.sessionId !== sessionId) return;
        chunks.push('\x00DONE');
        resolve?.();
      });

      abortSignal.addEventListener('abort', () => {
        chunks.push('\x00ABORT');
        resolve?.();
      });

      await chatCommands.sendMessage(sessionId, content);

      try {
        while (true) {
          if (chunks.length === 0) {
            await new Promise<void>((r) => { resolve = r; });
            resolve = null;
          }
          const chunk = chunks.shift();
          if (!chunk) continue;
          if (chunk === '\x00DONE' || chunk === '\x00ABORT') break;
          accumulated += chunk;
          yield {
            content: [{ type: 'text', text: accumulated }],
          };
        }
      } finally {
        unlistenOutput();
        unlistenResult();
      }
    },
  };
}
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/lib/TauriChatModelAdapter.ts
```

- [ ] **Commit**

```bash
git add src/lib/TauriChatModelAdapter.ts
git commit -m "feat(chat): add TauriChatModelAdapter"
```

---

## Task 13: Create ChatPanel and SessionList

**Files:**
- Create: `src/components/chat/SessionList.tsx`
- Create: `src/components/chat/ChatPanel.tsx`

- [ ] **Create `src/components/chat/SessionList.tsx`**:

```typescript
import { type FC } from 'react';
import type { SessionInfo } from '../../lib/chatCommands';

interface SessionListProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onClose: (sessionId: string) => void;
  onOpenSettings: () => void;
}

const stateIndicator: Record<SessionInfo['state'], string> = {
  idle: '●',
  thinking: '⋯',
  request_input: '◐',
  request_permission: '🛡',
  error: '✕',
};

const stateColor: Record<SessionInfo['state'], string> = {
  idle: 'text-muted-foreground',
  thinking: 'text-foreground animate-pulse',
  request_input: 'text-yellow-500',
  request_permission: 'text-blue-500',
  error: 'text-destructive',
};

export const SessionList: FC<SessionListProps> = ({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onClose,
  onOpenSettings,
}) => {
  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sessions</span>
        <button
          type="button"
          onClick={onNew}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground text-base leading-none"
          aria-label="New session"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.map((s) => (
          <div
            key={s.sessionId}
            className={`group relative flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-muted ${
              s.sessionId === activeSessionId ? 'bg-muted border-l-2 border-primary' : ''
            }`}
            onClick={() => onSelect(s.sessionId)}
          >
            <span className={`shrink-0 text-xs ${stateColor[s.state]}`}>
              {stateIndicator[s.state]}
            </span>
            <span className="flex-1 truncate text-foreground">{s.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(s.sessionId); }}
              className="hidden h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex"
              aria-label="Close session"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center justify-center rounded-md py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition"
          aria-label="Settings"
        >
          ⚙ Settings
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Create `src/components/chat/ChatPanel.tsx`**:

```typescript
import { ThreadPrimitive } from '@assistant-ui/react';
import { type FC } from 'react';
import type { PermissionRequestPayload } from './PermissionRequestCard';
import { PermissionRequestCard } from './PermissionRequestCard';
import { UserQuestionCard } from './UserQuestionCard';
import { Composer } from './Composer';
import { StatusBar, type PermissionMode, type SessionState } from './StatusBar';
import { ChatMessage } from './ChatMessage';
import type { ModelOption } from './ModelSelector';

interface PendingPermission extends PermissionRequestPayload { id: string; }
interface PendingQuestion { id: string; sessionId: string; question: string; choices: string[]; }

interface ChatPanelProps {
  modelOptions: ModelOption[];
  selectedModel: string;
  onModelChange: (key: string) => void;
  onCompact: () => Promise<void>;
  contextPct: number;
  subscriptionPct: number;
  gitBranch: string;
  gitDirty: boolean;
  permissionMode: PermissionMode;
  sessionState: SessionState;
  pendingPermissions: PendingPermission[];
  pendingQuestions: PendingQuestion[];
  onAllowPermission: (sessionId: string, toolName: string) => void;
  onAllowAlwaysPermission: (sessionId: string, toolName: string) => void;
  onDenyPermission: (sessionId: string, toolName: string) => void;
  onAnswerQuestion: (sessionId: string, answer: string) => void;
}

export const ChatPanel: FC<ChatPanelProps> = ({
  modelOptions, selectedModel, onModelChange, onCompact,
  contextPct, subscriptionPct, gitBranch, gitDirty,
  permissionMode, sessionState,
  pendingPermissions, pendingQuestions,
  onAllowPermission, onAllowAlwaysPermission, onDenyPermission, onAnswerQuestion,
}) => {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto p-4 pt-8">
        <ThreadPrimitive.Messages>
          {() => <ChatMessage />}
        </ThreadPrimitive.Messages>
        {pendingPermissions.map((p) => (
          <PermissionRequestCard
            key={p.id}
            payload={p}
            onAllow={onAllowPermission}
            onAllowAlways={onAllowAlwaysPermission}
            onDeny={onDenyPermission}
          />
        ))}
        {pendingQuestions.map((q) => (
          <UserQuestionCard
            key={q.id}
            sessionId={q.sessionId}
            question={q.question}
            choices={q.choices}
            onAnswer={onAnswerQuestion}
          />
        ))}
        <div aria-hidden="true" className="h-4" />
      </ThreadPrimitive.Viewport>
      <div className="shrink-0 px-4 pb-2">
        <Composer
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          onCompact={onCompact}
        />
      </div>
      <StatusBar
        contextPct={contextPct}
        subscriptionPct={subscriptionPct}
        gitBranch={gitBranch}
        gitDirty={gitDirty}
        permissionMode={permissionMode}
        sessionState={sessionState}
      />
    </div>
  );
};
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit
pnpm oxlint src/components/chat/SessionList.tsx src/components/chat/ChatPanel.tsx
```

- [ ] **Commit**

```bash
git add src/components/chat/SessionList.tsx src/components/chat/ChatPanel.tsx
git commit -m "feat(chat): add SessionList and ChatPanel components"
```

---

## Task 14: Create ChatApp with runtime

**Files:**
- Create: `src/ChatApp.tsx` (replaces placeholder in `src/main.tsx`)
- Modify: `src/main.tsx`

- [ ] **Create `src/ChatApp.tsx`**:

```typescript
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { ThreadPrimitive } from '@assistant-ui/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionMode, SessionState } from './components/chat/StatusBar';
import { SessionList } from './components/chat/SessionList';
import { ChatPanel } from './components/chat/ChatPanel';
import { chatCommands, type SessionInfo, type AllowlistEntry } from './lib/chatCommands';
import { createTauriChatModelAdapter } from './lib/TauriChatModelAdapter';
import type { ModelOption } from './components/chat/ModelSelector';
import type { PermissionRequestPayload } from './components/chat/PermissionRequestCard';
import type { ProfilesStore } from './types';
import './lib/i18n';
import './App.css';

interface PendingPermission extends PermissionRequestPayload { id: string; }
interface PendingQuestion { id: string; sessionId: string; question: string; choices: string[]; }
interface SessionStateMap { [sessionId: string]: { state: SessionState; permissionMode: PermissionMode; }; }
interface TokenUsage { contextPct: number; subscriptionPct: number; }

function ChatAppInner() {
  const { i18n } = useTranslation();
  const [store, setStore] = useState<ProfilesStore | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStates, setSessionStates] = useState<SessionStateMap>({});
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ contextPct: 0, subscriptionPct: 0 });
  const [gitBranch, setGitBranch] = useState('');
  const [gitDirty, setGitDirty] = useState(false);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [selectedModel, setSelectedModel] = useState('main');
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
        prev.map((s) => s.sessionId === e.payload.sessionId ? { ...s, state: e.payload.state } : s),
      );
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for permission requests
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; toolName: string; command: string }>('permission-request', (e) => {
      setPendingPermissions((prev) => [
        ...prev,
        { id: crypto.randomUUID(), sessionId: e.payload.sessionId, toolName: e.payload.toolName, command: e.payload.command },
      ]);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for request-input with choices
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; question: string; choices?: string[] }>('request-input', (e) => {
      if (e.payload.choices && e.payload.choices.length > 0) {
        setPendingQuestions((prev) => [
          ...prev,
          { id: crypto.randomUUID(), sessionId: e.payload.sessionId, question: e.payload.question, choices: e.payload.choices! },
        ]);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for result (token usage)
  useEffect(() => {
    const unlisten = listen<{ sessionId: string; usage: { contextPct: number; subscriptionPct: number } | null }>('result', (e) => {
      if (e.payload.usage && e.payload.sessionId === activeSessionId) {
        setTokenUsage(e.payload.usage);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [activeSessionId]);

  const refreshSessions = useCallback(async () => {
    const list = await chatCommands.listSessions();
    setSessions(list);
  }, []);

  async function handleNewSession() {
    if (!store) return;
    const profile = store.profiles.find((p) => p.id === store.active_profile_id);
    if (!profile) return;
    const result = await chatCommands.createSession(profile.id, profile.models?.cwd ?? '');
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
    setPendingPermissions((prev) => prev.filter((p) => !(p.sessionId === sessionId && p.toolName === toolName)));
  }

  async function handleAllowAlwaysPermission(sessionId: string, toolName: string) {
    await chatCommands.allowPermission(sessionId, toolName);
    setPendingPermissions((prev) => prev.filter((p) => !(p.sessionId === sessionId && p.toolName === toolName)));
  }

  async function handleDenyPermission(sessionId: string, toolName: string) {
    await chatCommands.denyPermission(sessionId, toolName);
    setPendingPermissions((prev) => prev.filter((p) => !(p.sessionId === sessionId && p.toolName === toolName)));
  }

  async function handleAnswerQuestion(sessionId: string, answer: string) {
    await chatCommands.answerQuestion(sessionId, answer);
    setPendingQuestions((prev) => prev.filter((q) => q.sessionId !== sessionId));
  }

  const activeSessionState = activeSessionId ? (sessionStates[activeSessionId]?.state ?? 'idle') : 'idle';
  const activePermissionMode = activeSessionId ? (sessionStates[activeSessionId]?.permissionMode ?? 'default') : 'default';

  // Build model options from active profile
  const modelOptions: ModelOption[] = store
    ? Object.entries(store.profiles.find((p) => p.id === store.active_profile_id)?.models ?? {}).map(
        ([key, value]) => ({ key, label: String(value) }),
      )
    : [{ key: 'main', label: 'Default' }];

  if (!store) return null;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-screen w-screen overflow-hidden bg-background">
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onNew={handleNewSession}
          onClose={handleCloseSession}
          onOpenSettings={() => invoke('toggle_settings_window')}
        />
        <ChatPanel
          modelOptions={modelOptions.length > 0 ? modelOptions : [{ key: 'main', label: 'Default' }]}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          onCompact={handleCompact}
          contextPct={tokenUsage.contextPct}
          subscriptionPct={tokenUsage.subscriptionPct}
          gitBranch={gitBranch}
          gitDirty={gitDirty}
          permissionMode={activePermissionMode}
          sessionState={activeSessionState}
          pendingPermissions={pendingPermissions.filter((p) => p.sessionId === activeSessionId)}
          pendingQuestions={pendingQuestions.filter((q) => q.sessionId === activeSessionId)}
          onAllowPermission={handleAllowPermission}
          onAllowAlwaysPermission={handleAllowAlwaysPermission}
          onDenyPermission={handleDenyPermission}
          onAnswerQuestion={handleAnswerQuestion}
        />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

export function ChatApp() {
  return <ChatAppInner />;
}
```

- [ ] **Update `src/main.tsx`** to use `ChatApp`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatApp } from './ChatApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChatApp />
  </React.StrictMode>,
);
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit
pnpm oxlint src/ChatApp.tsx src/main.tsx
```

- [ ] **Commit**

```bash
git add src/ChatApp.tsx src/main.tsx
git commit -m "feat(chat): add ChatApp with runtime and full wiring"
```

---

## Task 15: Add permission allowlist Rust module

**Files:**
- Create: `src-tauri/src/permission_allowlist.rs`
- Modify: `src-tauri/src/state.rs`

- [ ] **Create `src-tauri/src/permission_allowlist.rs`**:

```rust
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AllowlistEntry {
    pub command: String,
    pub approved_count: u32,
    #[serde(with = "time::serde::rfc3339")]
    pub last_approved_at: OffsetDateTime,
}

#[derive(Default, Debug, Serialize, Deserialize)]
pub struct PermissionAllowlist {
    pub entries: HashMap<String, AllowlistEntry>,
}

impl PermissionAllowlist {
    pub fn load(app_data_dir: &Path) -> Self {
        let path = app_data_dir.join("permission_allowlist.json");
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, app_data_dir: &Path) -> Result<(), String> {
        let path = app_data_dir.join("permission_allowlist.json");
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| e.to_string())
    }

    pub fn allow(&mut self, command: &str) {
        let entry = self.entries.entry(command.to_string()).or_insert_with(|| AllowlistEntry {
            command: command.to_string(),
            approved_count: 0,
            last_approved_at: OffsetDateTime::now_utc(),
        });
        entry.approved_count += 1;
        entry.last_approved_at = OffsetDateTime::now_utc();
    }

    pub fn remove(&mut self, commands: &[String]) {
        for cmd in commands { self.entries.remove(cmd); }
    }

    pub fn clear(&mut self) { self.entries.clear(); }

    pub fn should_auto_approve(&self, raw_command: &str, session_cwd: &Path) -> bool {
        let resolved = resolve_command(raw_command, session_cwd);
        let cmd = resolved.split_whitespace().next().unwrap_or(resolved);
        self.entries.contains_key(cmd)
    }

    pub fn entries_sorted(&self) -> Vec<&AllowlistEntry> {
        let mut v: Vec<_> = self.entries.values().collect();
        v.sort_by(|a, b| b.last_approved_at.cmp(&a.last_approved_at));
        v
    }
}

/// Strip a leading `cd <dir> &&` or `cd <dir>;` prefix if the target matches session_cwd.
pub fn resolve_command<'a>(raw: &'a str, session_cwd: &Path) -> &'a str {
    let trimmed = raw.trim();
    // Match: cd <path> && <rest> OR cd <path>; <rest>
    if let Some(rest) = trimmed.strip_prefix("cd ") {
        if let Some((cd_target, rest_cmd)) = rest
            .split_once(" && ")
            .or_else(|| rest.split_once("; "))
        {
            let cd_path = Path::new(cd_target.trim());
            let canonical_target = std::fs::canonicalize(cd_path).unwrap_or_else(|_| cd_path.to_path_buf());
            let canonical_cwd = std::fs::canonicalize(session_cwd).unwrap_or_else(|_| session_cwd.to_path_buf());
            if canonical_target == canonical_cwd {
                return rest_cmd.trim();
            }
        }
    }
    trimmed
}
```

- [ ] **Update `src-tauri/src/state.rs`** — add `PermissionAllowlist` field to `AppState`:

```rust
use crate::permission_allowlist::PermissionAllowlist;

pub struct AppState {
    pub store: Mutex<ProfilesStore>,
    pub app_data_dir: Mutex<PathBuf>,
    pub sessions: Mutex<HashMap<String, SessionHandle>>,
    pub chat_sessions: ChatSessionManager,
    pub allowlist: Mutex<PermissionAllowlist>,
}
```

- [ ] **Update `src-tauri/src/lib.rs`** to declare the module and initialize allowlist:

Add `mod permission_allowlist;` near the top.

In the `manage(AppState { ... })` call, add:
```rust
allowlist: Mutex::new(PermissionAllowlist::default()),
```

In the `setup` closure, after loading config, load the allowlist:
```rust
let allowlist = PermissionAllowlist::load(&app_data_dir);
*state.allowlist.lock().unwrap() = allowlist;
```

- [ ] **Clippy check**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml
```

- [ ] **Commit**

```bash
git add src-tauri/src/permission_allowlist.rs src-tauri/src/state.rs src-tauri/src/lib.rs
git commit -m "feat(chat): add permission allowlist Rust module"
```

---

## Task 16: Add Rust chat commands

**Files:**
- Create: `src-tauri/src/commands_chat.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)
- Modify: `src-tauri/src/chat.rs` (add send_message, streaming, compact)

- [ ] **Create `src-tauri/src/commands_chat.rs`**:

```rust
use tauri::{AppHandle, State};
use time::OffsetDateTime;

use crate::chat;
use crate::permission_allowlist::AllowlistEntry;
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct SessionInfoDto {
    pub session_id: String,
    pub name: String,
    pub profile_id: String,
    pub state: crate::state::SessionState,
    pub cwd: std::path::PathBuf,
    pub last_used_at: String,
    pub message_count: u32,
}

#[tauri::command]
pub async fn chat_create_session(
    profile_id: String,
    directory: String,
    app: AppHandle,
) -> Result<chat::CreateChatSessionResult, String> {
    chat::create_chat_session(&profile_id, std::path::PathBuf::from(directory), app).await
}

#[tauri::command]
pub async fn chat_close_session(session_id: String, app: AppHandle) -> Result<(), String> {
    chat::close_chat_session(&session_id, app).await
}

#[tauri::command]
pub async fn chat_send_message(
    session_id: String,
    content: String,
    attachments: Option<Vec<String>>,
    app: AppHandle,
) -> Result<(), String> {
    chat::send_message(&session_id, content, attachments, app).await
}

#[tauri::command]
pub async fn chat_compact(session_id: String, app: AppHandle) -> Result<(), String> {
    chat::compact_session(&session_id, app).await
}

#[tauri::command]
pub async fn chat_list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfoDto>, String> {
    let sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions
        .iter()
        .map(|(id, s)| SessionInfoDto {
            session_id: id.clone(),
            name: s.session_name.clone(),
            profile_id: String::new(),
            state: s.state,
            cwd: s.cwd.clone(),
            last_used_at: OffsetDateTime::now_utc().to_string(),
            message_count: 0,
        })
        .collect())
}

#[tauri::command]
pub async fn chat_delete_sessions(
    session_ids: Vec<String>,
    app: AppHandle,
) -> Result<(), String> {
    for id in &session_ids {
        chat::close_chat_session(id, app.clone()).await.ok();
    }
    Ok(())
}

#[tauri::command]
pub async fn chat_delete_outdated_sessions(
    days: u32,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // cc-sdk sessions are managed externally; placeholder returns 0
    Ok(serde_json::json!({ "deleted": 0 }))
}

#[tauri::command]
pub async fn chat_delete_small_sessions(
    min_messages: u32,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "deleted": 0 }))
}

#[tauri::command]
pub async fn chat_set_permission_mode(
    session_id: String,
    mode: crate::state::PermissionMode,
    app: AppHandle,
) -> Result<(), String> {
    chat::set_permission_mode(&session_id, mode, app).await
}

#[tauri::command]
pub async fn chat_allow_permission(
    session_id: String,
    tool_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
    let cwd = sessions
        .get(&session_id)
        .map(|s| s.cwd.clone())
        .unwrap_or_default();
    drop(sessions);

    let app_data_dir = state.app_data_dir.lock().unwrap().clone();
    let mut allowlist = state.allowlist.lock().map_err(|e| e.to_string())?;
    let cmd = crate::permission_allowlist::resolve_command(&tool_name, &cwd);
    let cmd_name = cmd.split_whitespace().next().unwrap_or(cmd);
    // Note: allowlist.allow() tracks by command name; actual cc-sdk approval handled separately
    allowlist.allow(cmd_name);
    allowlist.save(&app_data_dir).ok();
    Ok(())
}

#[tauri::command]
pub async fn chat_deny_permission(
    _session_id: String,
    _tool_name: String,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn chat_answer_question(
    session_id: String,
    answer: String,
    app: AppHandle,
) -> Result<(), String> {
    chat::send_message(&session_id, answer, None, app).await
}

#[tauri::command]
pub async fn chat_get_allowlist(
    state: State<'_, AppState>,
) -> Result<Vec<AllowlistEntry>, String> {
    let allowlist = state.allowlist.lock().map_err(|e| e.to_string())?;
    Ok(allowlist.entries_sorted().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn chat_remove_from_allowlist(
    commands: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let app_data_dir = state.app_data_dir.lock().unwrap().clone();
    let mut allowlist = state.allowlist.lock().map_err(|e| e.to_string())?;
    allowlist.remove(&commands);
    allowlist.save(&app_data_dir).ok();
    Ok(())
}

#[tauri::command]
pub async fn chat_clear_allowlist(state: State<'_, AppState>) -> Result<(), String> {
    let app_data_dir = state.app_data_dir.lock().unwrap().clone();
    let mut allowlist = state.allowlist.lock().map_err(|e| e.to_string())?;
    allowlist.clear();
    allowlist.save(&app_data_dir).ok();
    Ok(())
}
```

- [ ] **Update `src-tauri/src/chat.rs`** — add `send_message` and `compact_session`:

```rust
use tauri::Emitter;

/// Payload emitted to frontend for streamed message chunks.
#[derive(serde::Serialize, Clone)]
pub struct ChatOutputPayload {
    pub session_id: String,
    pub content: String,
    pub part_type: String,
}

/// Sends a message on an existing session and streams response via Tauri events.
/// NOTE: Consult cc-sdk 0.8.x docs for the exact streaming API on ClaudeSDKClient.
/// The pattern below is representative — adjust method names to match the crate.
pub async fn send_message(
    session_id: &str,
    content: String,
    _attachments: Option<Vec<String>>,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    // Mark session as thinking
    {
        let mut sessions = state.chat_sessions.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(s) = sessions.get_mut(session_id) {
            s.state = SessionState::Thinking;
        }
    }
    app.emit("session-state", serde_json::json!({ "session_id": session_id, "state": "thinking" })).ok();

    // Spawn streaming task
    let session_id_owned = session_id.to_string();
    let app_clone = app.clone();
    tokio::spawn(async move {
        let state = app_clone.state::<AppState>();
        // Obtain a reference to the client — requires calling query on it.
        // Since ClaudeSDKClient is not Clone and lives in a Mutex<HashMap>, we process
        // the query inline within the lock or extract it. Consult cc-sdk docs for
        // the recommended pattern for async streaming from a stored client.
        //
        // Pseudocode (replace with real cc-sdk API):
        // let mut sessions = state.chat_sessions.sessions.lock()...;
        // let session = sessions.get_mut(&session_id_owned)...;
        // let mut stream = session.client.query(&content).await?;
        // drop(sessions); // release lock before awaiting
        // while let Some(event) = stream.next().await {
        //     app_clone.emit("chat-output", ChatOutputPayload { ... }).ok();
        // }
        // app_clone.emit("result", ...).ok();
        // app_clone.emit("session-state", { state: "idle" }).ok();
        log::info!("send_message streaming for session {}", session_id_owned);
    });
    Ok(())
}

/// Sends the /compact command to the active cc-sdk session.
pub async fn compact_session(session_id: &str, app: AppHandle) -> Result<(), String> {
    send_message(session_id, "/compact".to_string(), None, app).await
}
```

- [ ] **Update `src-tauri/src/lib.rs`** — add `mod commands_chat;` and register all commands:

```rust
mod commands_chat;
```

Add to `invoke_handler`:
```rust
commands_chat::chat_create_session,
commands_chat::chat_close_session,
commands_chat::chat_send_message,
commands_chat::chat_compact,
commands_chat::chat_list_sessions,
commands_chat::chat_delete_sessions,
commands_chat::chat_delete_outdated_sessions,
commands_chat::chat_delete_small_sessions,
commands_chat::chat_set_permission_mode,
commands_chat::chat_allow_permission,
commands_chat::chat_deny_permission,
commands_chat::chat_answer_question,
commands_chat::chat_get_allowlist,
commands_chat::chat_remove_from_allowlist,
commands_chat::chat_clear_allowlist,
```

- [ ] **Clippy check**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml
```

- [ ] **Commit**

```bash
git add src-tauri/src/commands_chat.rs src-tauri/src/chat.rs src-tauri/src/lib.rs
git commit -m "feat(chat): add Rust chat commands and register handlers"
```

---

## Task 17: Add Permissions and Sessions tabs to SettingsApp

**Files:**
- Modify: `src/SettingsApp.tsx`

- [ ] **Add state and handlers** to `SettingsApp.tsx` for two new tabs (`'permissions'` and `'sessions'`). Extend the `activeTab` type:

```typescript
type TabId = 'profiles' | 'terminal' | 'permissions' | 'sessions';
const [activeTab, setActiveTab] = useState<TabId>('profiles');
```

- [ ] **Add permissions tab state**:

```typescript
const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
const [selectedCommands, setSelectedCommands] = useState<Set<string>>(new Set());

async function loadAllowlist() {
  const entries = await chatCommands.getAllowlist();
  setAllowlist(entries);
}

async function handleRemoveSelected() {
  await chatCommands.removeFromAllowlist([...selectedCommands]);
  setSelectedCommands(new Set());
  await loadAllowlist();
}

async function handleClearAllowlist() {
  await chatCommands.clearAllowlist();
  await loadAllowlist();
}
```

- [ ] **Add sessions tab state**:

```typescript
const [chatSessions, setChatSessions] = useState<SessionInfo[]>([]);
const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

async function loadChatSessions() {
  const list = await chatCommands.listSessions();
  setChatSessions(list);
}

async function handleRemoveSelectedSessions() {
  await chatCommands.deleteSessions([...selectedSessionIds]);
  setSelectedSessionIds(new Set());
  await loadChatSessions();
}

async function handleRemoveOutdated() {
  await chatCommands.deleteOutdatedSessions(30);
  await loadChatSessions();
}

async function handleRemoveSmall() {
  await chatCommands.deleteSmallSessions(5);
  await loadChatSessions();
}
```

- [ ] **Load data when switching tabs** — in the tab bar `onClick`, call `loadAllowlist()` or `loadChatSessions()` when switching to those tabs.

- [ ] **Render permissions tab**:

```tsx
{activeTab === 'permissions' && (
  <div className="flex flex-1 flex-col overflow-hidden">
    <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4 gap-2">
      <p className="text-xs text-muted-foreground mb-2">Approved commands auto-approve future identical requests.</p>
      {allowlist.map((entry) => (
        <div key={entry.command} className="flex items-center gap-3 rounded border border-border px-3 py-2">
          <input
            type="checkbox"
            checked={selectedCommands.has(entry.command)}
            onChange={(e) => {
              setSelectedCommands((prev) => {
                const next = new Set(prev);
                e.target.checked ? next.add(entry.command) : next.delete(entry.command);
                return next;
              });
            }}
          />
          <span className="flex-1 font-mono text-sm text-foreground">{entry.command}</span>
          <span className="text-xs text-muted-foreground">approved {entry.approvedCount}×</span>
        </div>
      ))}
      {allowlist.length === 0 && (
        <p className="text-sm text-muted-foreground">No approved commands yet.</p>
      )}
    </div>
    <div className="border-t border-border flex justify-end gap-2 px-5 py-3">
      <Button variant="outline" onClick={handleRemoveSelected} disabled={selectedCommands.size === 0}>
        Remove Selected
      </Button>
      <Button variant="destructive" onClick={handleClearAllowlist} disabled={allowlist.length === 0}>
        Clear All
      </Button>
    </div>
  </div>
)}
```

- [ ] **Render sessions tab**:

```tsx
{activeTab === 'sessions' && (
  <div className="flex flex-1 flex-col overflow-hidden">
    <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4 gap-2">
      {chatSessions.map((s) => (
        <div key={s.sessionId} className="flex items-center gap-3 rounded border border-border px-3 py-2">
          <input
            type="checkbox"
            checked={selectedSessionIds.has(s.sessionId)}
            onChange={(e) => {
              setSelectedSessionIds((prev) => {
                const next = new Set(prev);
                e.target.checked ? next.add(s.sessionId) : next.delete(s.sessionId);
                return next;
              });
            }}
          />
          <span className="flex-1 truncate text-sm text-foreground">{s.name}</span>
          <span className="text-xs text-muted-foreground">{s.messageCount} msgs</span>
          <span className="text-xs text-muted-foreground">{s.lastUsedAt}</span>
        </div>
      ))}
      {chatSessions.length === 0 && (
        <p className="text-sm text-muted-foreground">No sessions.</p>
      )}
    </div>
    <div className="border-t border-border flex justify-end gap-2 px-5 py-3">
      <Button variant="outline" onClick={handleRemoveSelectedSessions} disabled={selectedSessionIds.size === 0}>
        Remove Selected
      </Button>
      <Button variant="outline" onClick={handleRemoveOutdated}>
        Remove Outdated (&gt;30d)
      </Button>
      <Button variant="outline" onClick={handleRemoveSmall}>
        Remove Small (&lt;5 msgs)
      </Button>
    </div>
  </div>
)}
```

- [ ] **Add tab buttons** to the tab bar for Permissions and Sessions:

```tsx
{(['profiles', 'terminal', 'permissions', 'sessions'] as TabId[]).map((tab) => (
  <button
    key={tab}
    onClick={() => setActiveTab(tab)}
    className={`px-4 py-2.5 text-sm capitalize ${
      activeTab === tab ? 'text-primary border-primary border-b-2' : 'text-muted-foreground'
    }`}
  >
    {tab}
  </button>
))}
```

- [ ] **Add imports** at top of `src/SettingsApp.tsx`:

```typescript
import { chatCommands, type AllowlistEntry, type SessionInfo } from './lib/chatCommands';
```

- [ ] **Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm oxlint src/SettingsApp.tsx
```

- [ ] **Commit**

```bash
git add src/SettingsApp.tsx
git commit -m "feat(settings): add Permissions and Sessions tabs"
```

---

## Task 18: Format, lint, final type-check

- [ ] **Format all new/modified TypeScript files**

```bash
pnpm oxfmt src/ChatApp.tsx src/TerminalWindowApp.tsx src/SettingsApp.tsx src/terminal.tsx src/main.tsx src/settings.tsx src/lib/chatCommands.ts src/lib/TauriChatModelAdapter.ts src/components/assistant-ui/markdown-text.tsx src/components/chat/ChatMessage.tsx src/components/chat/Composer.tsx src/components/chat/ModelSelector.tsx src/components/chat/StatusBar.tsx src/components/chat/SessionList.tsx src/components/chat/ChatPanel.tsx src/components/chat/PermissionRequestCard.tsx src/components/chat/UserQuestionCard.tsx
```

- [ ] **Lint all new/modified TypeScript files**

```bash
pnpm oxlint src/ChatApp.tsx src/TerminalWindowApp.tsx src/SettingsApp.tsx src/terminal.tsx src/main.tsx src/settings.tsx src/lib/chatCommands.ts src/lib/TauriChatModelAdapter.ts src/components/assistant-ui/markdown-text.tsx src/components/chat/ChatMessage.tsx src/components/chat/Composer.tsx src/components/chat/ModelSelector.tsx src/components/chat/StatusBar.tsx src/components/chat/SessionList.tsx src/components/chat/ChatPanel.tsx src/components/chat/PermissionRequestCard.tsx src/components/chat/UserQuestionCard.tsx
```

Fix any lint errors reported. Do not use `eslint-disable-next-line`.

- [ ] **Full type-check**

```bash
pnpm tsc --noEmit
```

- [ ] **Rust clippy**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml
```

- [ ] **Commit any formatting fixes**

```bash
git add -u
git commit -m "chore: format and lint fixes"
```

---

## Self-Review Notes

- **cc-sdk streaming (Task 16):** The `send_message` function contains a pseudocode block. Before implementing, consult cc-sdk 0.8.x documentation for the exact `ClaudeSDKClient` query/stream API. The surrounding structure (emit events, spawn tokio task, update session state) is correct — only the inner streaming call needs the real API.
- **`chat_delete_outdated_sessions` / `chat_delete_small_sessions` (Task 16):** Placeholder returning `{ deleted: 0 }`. Full implementation requires cc-sdk session storage access (list sessions from `~/.claude/sessions`, filter, delete). Implement after confirming cc-sdk session file format.
- **Permission mode cycling (shift+tab):** Designed in spec (shift+tab in composer cycles default→auto→plan), not implemented in this plan — add as follow-up once basic chat is working.
- **Git status in status bar:** `gitBranch`/`gitDirty` wired to state in `ChatApp` but not populated. Add a `get_git_status` Tauri command + 30s polling as a follow-up.
- **`handleNewSession` cwd:** Uses `profile.models?.cwd` which doesn't exist in `ProfileConfig`. Replace with a directory picker dialog (same pattern as terminal new session) as a follow-up.
