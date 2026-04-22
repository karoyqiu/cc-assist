# Chat GUI Redesign

**Date:** 2026-04-22
**Supersedes:** `docs/superpowers/specs/2026-04-20-chat-gui-design.md` (partially — see section notes)

## Overview

Three changes bundled together:

1. **Multi-window architecture** — chat becomes the main window; every top-level window gets a dedicated HTML entry file and `XxxApp` component.
2. **Chat panel visual** — matches the `assistant-ui` Claude reference (`claude.tsx`), adapted to DESIGN.md tokens (CSS variables, system-ui font).
3. **Functional additions** — compact button, permission request card, user question card; status bar moves to footer.

---

## 1. Multi-Window Architecture

### Window Table

| Window    | Label      | HTML              | Entry file              | App component        | Size     |
|-----------|------------|-------------------|-------------------------|----------------------|----------|
| Chat      | `main`     | `index.html`      | `src/main.tsx`          | `ChatApp`            | 1000×700 |
| Terminal  | `terminal` | `terminal.html`   | `src/terminal.tsx`      | `TerminalWindowApp`  | 800×600  |
| Settings  | `settings` | `settings.html`   | `src/settings.tsx`      | `SettingsApp`        | 700×500  |

### File Changes

**New files:**
- `src/ChatApp.tsx` — chat window root component
- `src/TerminalWindowApp.tsx` — extracted from current `App.tsx`
- `src/SettingsApp.tsx` — extracted from current `App.tsx`
- `src/terminal.tsx` — entry point for terminal window
- `terminal.html` — Vite HTML entry for terminal window (sibling of `index.html`)

**Modified files:**
- `src/main.tsx` — import `ChatApp` instead of `TerminalWindowApp`
- `src/settings.tsx` — import `SettingsApp` from `./SettingsApp` instead of `./App`
- `vite.config.ts` — add `terminal.html` as additional entry point (mirrors existing `settings.html` entry)
- `src-tauri/tauri.conf.json` — update `main` window to 1000×700; add `terminal` window with `url: "terminal.html"`, 800×600

**Deleted files:**
- `src/App.tsx` — both app components extracted; file no longer needed

### tauri.conf.json diff (windows array)

```json
[
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

### Tray Menu Update

- "Open Chat" → opens/focuses `main` window
- "Open Terminal" → opens/focuses `terminal` window (unchanged behavior, new label)

---

## 2. Chat Panel Visual

### Reference

Source: `assistant-ui` Claude example (`claude.tsx`). Adapted per DESIGN.md:
- `font-serif` → system-ui (no font class applied — inherits `font-sans` from Tailwind base)
- All hardcoded hex colors → CSS variables / Tailwind semantic classes
- No tools button, no thinking toggle (dropped)

### Layout

```
┌─ Sidebar (220pt) ─┬──────── Chat Panel (flex-1) ────────┐
│  (unchanged from  │  Messages (flex-1, scrollable)       │
│   original spec)  ├──────────────────────────────────────┤
│                   │  Composer (card, above status bar)   │
│                   ├──────────────────────────────────────┤
│                   │  Status bar (28pt footer strip)      │
└───────────────────┴──────────────────────────────────────┘
```

### Thread Background

- Light: `bg-background` (maps to Parchment `#f5f4ed` via CSS var)
- Dark: `bg-background` (maps to Near Black `#141413`)
- Padding: `p-4 pt-16` (matches reference)

### User Messages

- Bubble: `bg-muted` / text `text-foreground`
- Border-radius: `rounded-xl`
- Avatar: `bg-foreground text-background`, letter "U", 28px circle
- Max width: `max-w-[75ch]`
- Action bar on hover: Reload, Edit (`ActionBarPrimitive`)

### Assistant Messages

- No bubble — plain text, `text-foreground`
- Bottom margin `mb-12` to make room for action bar
- Action bar below last message: Copy, Thumbs Up, Thumbs Down, Reload (`ActionBarPrimitive`)
- Disclaimer on last message: "Claude can make mistakes. Please double-check responses." — `text-muted-foreground text-xs`

### Attachments (ClaudeAttachment)

Unchanged from reference: 120×120px thumbnail, remove button top-left on hover.
Colors → CSS variables: `bg-background`, `border-border`, `text-muted-foreground`.

---

## 3. Composer

### Structure

```
┌─────────────────────────────────────────────────────┐
│  ComposerPrimitive.Input                            │
│  "How can I help you today?"                        │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [+] [↺]                         [Model ▼]  [Send] │
└─────────────────────────────────────────────────────┘
[attachment chips if any]
```

### Buttons (left row)

| Button | Icon | Action |
|--------|------|--------|
| Add attachment | `PlusIcon` | `ComposerPrimitive.AddAttachment` |
| Compact | `ReloadIcon` | Invoke `chat_compact`; spinner (`animate-spin`) while in-progress; stops on completion or error |

### Model Selector (right row)

- Dropdown showing current model name
- Options populated from active profile's `models` map (main / sonnet / haiku / opus keys → display names)
- Selecting a model updates per-session model override
- Falls back to profile's default model if no override set

### Send Button

- `ComposerPrimitive.Send`
- Background: `bg-primary`, text `text-primary-foreground`
- Active: `active:scale-95`
- Disabled: `disabled:opacity-50 disabled:pointer-events-none`

### Key Bindings

- **Enter** → send message
- **Shift+Enter** → insert new line

### Card Styling

- Background: `bg-card`
- Shadow: ring shadow per DESIGN.md (`0px 0px 0px 0.5px` with `border-border`)
- Focus-within: elevated shadow
- Border-radius: `rounded-2xl`

### Attachment Strip

Shown when `attachments.length > 0`. Background: `bg-muted`, border-top `border-border`, `rounded-b-2xl`.

---

## 4. Status Bar (Footer)

Moved from above-composer to bottom footer strip. Content unchanged from original spec.

```
┌──────────────────────────────────────────────────────┐
│ ctx: 42%  sub: 78%  git: main ✗       [Default][idle]│
└──────────────────────────────────────────────────────┘
```

- Height: 28pt
- Background: `bg-background`
- Top border: `border-t border-border`
- Left: context %, subscription %, git branch + dirty flag — `text-muted-foreground text-xs`
- Right: permission mode badge + session state label
- Permission badge colors: Default (`bg-muted text-muted-foreground`), Auto (`bg-green-500/20 text-green-600`), Plan (`bg-blue-500/20 text-blue-600`)

---

## 5. Permission Request Card

Renders inline in the thread as a special message when `permission-request` event fires.

### Active State

```
┌─────────────────────────────────────────────────────┐
│ 🛡  Permission Request                              │
│  Run: grep -r "foo" src/                            │
│                                                     │
│  [Deny]        [Allow]        [Allow always]        │
└─────────────────────────────────────────────────────┘
```

- Card: `bg-card border border-border rounded-xl p-4`
- Tool name + full command/action detail shown
- Buttons: `Deny` (destructive variant), `Allow` (secondary), `Allow always` (secondary)
- "Allow always" → adds command to allowlist, emits `permission-approved`; subsequent identical commands auto-approve silently

### Resolved State

Card becomes read-only. Shows "Allowed" or "Denied" label with muted styling. Buttons removed.

---

## 6. User Question Card

Renders inline in the thread when `request_input` fires **and choices are provided**.

### With Choices

```
┌─────────────────────────────────────────────────────┐
│ ❓  Claude asks:                                    │
│  "Which approach would you prefer?"                 │
│                                                     │
│  [Option A                                        ] │
│  [Option B                                        ] │
│  [Option C                                        ] │
└─────────────────────────────────────────────────────┘
```

- Choices: full-width buttons, vertical stack, `gap-2`
- Card: `bg-card border border-border rounded-xl p-4`
- Clicking a choice → sends that choice as user message, card becomes read-only showing selected choice

### Without Choices

No card rendered. Session state transitions to `request_input` (yellow dot in status bar). User types answer in the composer normally.

### Resolved State

Card read-only. Selected choice highlighted with `bg-muted`, others dimmed. Buttons non-interactive.

---

## 7. New Tauri Command

| Command | Args | Returns | Description |
|---------|------|---------|-------------|
| `chat_compact` | `{ session_id }` | `()` | Trigger `/compact` on the cc-sdk session |

---

## Out of Scope (unchanged from original spec)

All other sections of `2026-04-20-chat-gui-design.md` remain in effect:
- Session states and audio
- Permission mode (shift+tab cycling)
- Slash commands and mentions
- Chain of thought
- Permission allowlist
- Session management UI
- Localization
