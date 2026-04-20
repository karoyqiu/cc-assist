# Chat GUI Design

## Overview

Replace the terminal with a ChatGPT-style GUI using **assistant-ui** (React) on the frontend and **cc-sdk** (Rust) on the backend, bridged via **Tauri channels**. The terminal window stays for reference. The chat GUI is a new separate Tauri window.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + assistant-ui)                    │
│  ┌────────────────────────────────────────────────┐ │
│  │ TauriChatModelAdapter (ChatModelAdapter)       │ │
│  │   - run() → tauri invoke()                    │ │
│  │   - yields ChatModelRunResult chunks          │ │
│  │ Listens: chat-output, session-state, etc.     │ │
│  └────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │ Tauri invoke + event channels
┌────────────────────▼────────────────────────────────┐
│  Backend (Rust + cc-sdk)                            │
│  ┌────────────────────────────────────────────────┐ │
│  │ AppState.chat_sessions: Mutex<HashMap<         │ │
│  │   SessionId, ChatSession>>                     │ │
│  │                                                │ │
│  │ ChatSession:                                   │ │
│  │   - client: ClaudeSDKClient (SubprocessTrans)  │ │
│  │   - permission_mode: PermissionMode            │ │
│  │   - state: SessionState                        │ │
│  │   - cwd: PathBuf                               │ │
│  └────────────────────────────────────────────────┘ │
│  Tauri event channels (emit → frontend):            │
│    chat-output, session-state, tool-call,
│  │ Listens: chat-output, session-state, permission-request,          │
│    result, rate-limit, permission-request           │
└─────────────────────────────────────────────────────┘
                     │
              cc-sdk (crates.io)
                     │
              Claude Code subprocess
```

### Key Design Decisions

- **One ClaudeSDKClient per session** — each chat session owns its cc-sdk client. This matches terminal sessions 1:1.
- **Tauri channels for streaming** — `chat-output` event carries streamed message fragments. `session-state` carries state transitions.
- **Profile env vars via `ClaudeCodeOptions::env`** — read existing `~/.claude/settings.json` first (preserving user's global env vars like `ANTHROPIC_TEMPERATURE`), then merge profile vars on top (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL, etc.) same as current terminal implementation in `settings.rs`.
- **cc-sdk native session storage** — sessions persist in cc-sdk's format at `~/.claude/sessions` (or wherever cc-sdk stores them). No session data in cc-assist profiles JSON.

---

## Window & Entry

- **Window**: Separate Tauri window (`label: "chat"`), 1000pt × 700pt, resizable
- **Open trigger**: Tray menu "Open Chat"
- **Close**: hides window (does not exit app)
- **Tray icon**: single icon, right-click menu: Open Terminal, Open Chat, Settings, Quit

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  Sidebar (220pt)    │  Chat Panel (flex-1)               │
│  ┌───────────────┐  │  ┌────────────────────────────┐    │
│  │Sessions   [+] │  │  │                            │    │
│  ├───────────────┤  │  │  Messages                  │    │
│  │ 💬 session    │  │  │  (scrollable, flex-1)      │    │
│  │ 💬 session    │  │  │                            │    │
│  │               │  │  ├────────────────────────────┤    │
│  ├───────────────┤  │  │ ctx:42% sub:78%  [Def][idle]│   │
│  │  ⚙            │  │  │ ─────────────────────────  │    │
│  └───────────────┘  │  │ [+] [input.........][M▼][➤]│   │
│                     │  └────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### Sidebar

#### Header: [+] Session Menu

"+" button opens a dropdown menu (not directly the new session dialog):

```
┌─────────────────────────────────┐
│  Recent Sessions                │
├─────────────────────────────────┤
│  💬 project-a (Anthropic)       │
│       2 min ago                 │
│  💬 project-b (Custom)          │
│       1 hour ago                │
│  💬 logs-parser (Anthropic)     │
│       Yesterday                 │
│  ... (up to 10)                 │
├─────────────────────────────────┤
│  ─────────────────────────────  │
│  + New session                  │
│  › More sessions…               │
└─────────────────────────────────┘
```

- **"› More sessions…"**: opens Settings → Sessions tab directly

- **Recent sessions** (up to 10): shows session name, profile name, last used timestamp. Click to resume.
- **"+ New session"**: opens new session dialog (profile + directory picker, same as terminal window)
- List sorted by `last_used_at` descending (most recent first)
- Only shows sessions associated with the current profile's provider or custom profiles

#### Session List

- Clickable rows, each shows:
  - **State icon**: idle (gray dot), thinking (animated dots), request-input (yellow), request-permission (blue shield), error (red)
  - **Session name** (editable on double-click)
  - **Hover**: shows × close button
- **Active item**: left border accent (profile icon_color), surface background

#### Bottom

- Settings ⚙ button (opens settings window)

#### Session Management (in Settings)

Accessible via Settings → Sessions tab:

```
┌─────────────────────────────────────────────────────┐
│  Sessions                                        [x]│
├─────────────────────────────────────────────────────┤
│  Sort: [Last used ▼]   Filter: [All profiles ▼]     │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ ☑ project-a  Anthropic  2 min ago  [Resume]   │  │
│  │ ☑ project-b  Custom     1 hour ago [Resume]   │  │
│  │ ☐ logs-parser Anthropic Yesterday  [Resume]   │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [Delete Selected] [Delete Outdated] [Delete Small] │
│                                                     │
│  Outdated: sessions not used in > 30 days           │
│  Small: sessions with < 5 messages                  │
└─────────────────────────────────────────────────────┘
```

- **Sort**: by last used (default), by name, by message count
- **Filter**: all profiles, or specific profile
- **Resume**: resumes that session in the chat window
- **Delete Selected**: removes checked sessions from cc-sdk storage + list
- **Delete Outdated**: removes sessions with `last_used_at` > 30 days
- **Delete Small**: removes sessions with < 5 messages
- Confirmation dialog before each bulk delete

### Chat Panel

Uses assistant-ui `ThreadPrimitive` layout. No header bar.

```
┌──────────────────────────────────────────────────────────┐
│  Messages (flex-1, scrollable)                           │
│  - User messages: right-aligned rounded bubbles          │
│  - Assistant messages: left-aligned                      │
│  - Tool calls: inline expandable                         │
│  - Chain-of-thought: collapsible inline (▶ Thinking)     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Status bar (28pt)                                       │
│  [ctx: 42%] [sub: 78%] [git: main ✗]    [Default] [idle] │
│                                                          │
│  Composer                                                │
│  [+] [text input............................] [Sonnet▼][➤]│
│  [attachment chips...]                                   │
└──────────────────────────────────────────────────────────┘
```

- **Message list**: `ThreadPrimitive.Root` → `ThreadPrimitive.Viewport` → `ThreadPrimitive.Messages` — scrolls in viewport, fills space above status bar
- **Status bar** (28pt, above composer): left = ctx%/sub%/git, **right = permission mode badge** + session state label
- **Composer** (`ComposerPrimitive.Root`, fixed at bottom):
  - Left: `ComposerAddAttachment` (+ button)
  - Center: `ComposerPrimitive.Input` (auto-grows, max ~200pt)
  - Right: model selector dropdown (populated from profile's `models` — main/haiku/sonnet/opus) + Send button
- **Chain-of-thought**: `ChainOfThoughtPrimitive.Parts` with `Reasoning` as collapsible inline block

---

## Session States

| State | Trigger | Icon | Audio |
|-------|---------|------|-------|
| `idle` | Session created, or after user input acknowledged | Gray dot | notification.mp3 |
| `request_input` | cc-sdk emits `request_input` | Yellow dot + pulse | notification.mp3 |
| `request_permission` | Claude requests approval for tool/edit | Blue shield | notification.mp3 |
| `thinking` | Assistant generating response | Animated dots | — |
| `error` | Stream error or client panic | Red dot | notification.mp3 |

**Audio**: Play `notification.mp3` on every state transition EXCEPT `thinking`. Volume 0.5. Always plays.

---

## Permission Mode (per-session, shift+tab)

Three modes, cycled via `shift+tab` in the composer input:

| Mode | Badge label | cc-sdk behavior |
|------|-------------|-----------------|
| `default` | "Default" | Standard permission prompts |
| `auto_accept_edits` | "Auto" | Auto-approve non-destructive edits |
| `plan_mode` | "Plan" | Run in plan mode only |

- Each session stores its own `permission_mode`
- Badge shown in status bar (right side), colored: Default (gray), Auto (green), Plan (blue)
- Shift+tab cycles: default → auto_accept_edits → plan_mode → default
- Visual: small popover appears briefly showing the new mode ("Plan mode enabled")

---

## Status Bar

Floating above the composer, above the input area.

| Segment | Location | Source | Format |
|---------|----------|--------|--------|
| Context % | Left | `token_tracker` from cc-sdk result event | `ctx: {n}%` |
| Subscription % | Left | `token_tracker` from cc-sdk result event | `sub: {n}%` |
| Git status | Left | `git status --porcelain` via Rust command | `git: {branch} {dirty?}` |
| Permission mode badge | Right | Per-session `permission_mode` | "Default" / "Auto" / "Plan" |
| Session state label | Right | `SessionState` enum | text label |

- Git status updates on directory change and every 30s
- Token % updates after each assistant result
- Permission badge colored: Default (gray), Auto (green), Plan (blue)

---

## Composer

### Attachments

- **Drag-drop**: drop files onto the composer area → add to attachment list
- **Paste**: Ctrl+V with file in clipboard → add to attachment list
- **UI**: chips below input showing filename + size + × remove button
- **Max**: 10 attachments per message (configurable)
- **Sending**: if cc-sdk supports attaching by filename, pass filename string. Otherwise, pass filename to Rust, read file content there, forward content to cc-sdk. No base64 encoding needed if cc-sdk accepts raw content.

### Slash Commands

Using assistant-ui `ComposerTrigger` with `/`:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear current conversation |
| `/model <model>` | Switch model (haiku/sonnet/opus/sonnet-4) |
| `/cancel` | Cancel current in-progress request |
| `/context` | Show context window usage |
| `/debug` | Toggle debug mode |
| `/resume` | Resume last session |
| `/fork` | Fork current session |

Slash command list populated from cc-sdk session context.

### Mentions

Using assistant-ui `ComposerTrigger` with `@`:

- Mention people, files, or tools
- Adapter provides items based on current session context
- Serialized as `:{type}[{label}]{name={id}}` in message content

---

## Chain of Thought

- assistant-ui `ChainOfThoughtPrimitive.Parts` renders reasoning
- Default: collapsed (show first line only with "▶ Thinking..." button)
- Expanded: shows full reasoning text
- Style: muted/italic text, subtle left border, distinct from main message
- Transition animation when expanding/collapsing

---

## cc-sdk Integration (Rust)

### Dependencies (Cargo.toml)

```toml
cc-sdk = "0.8.1"
tokio = { version = "1", features = ["rt-multi-thread", "sync", "io-util", "macros"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = ["tray-icon"] }
```

### Tauri Commands

| Command | Args | Returns | Description |
|---------|------|---------|-------------|
| `chat_create_session` | `{ profile_id, directory }` | `{ session_id, name }` | Spawn cc-sdk client |
| `chat_send_message` | `{ session_id, content, attachments? }` | `()` | Send user message |
| `chat_list_sessions` | — | `[{ session_id, name, state, cwd, last_used_at, message_count }]` | List all sessions |
| `chat_get_recent_sessions` | `{ profile_id?, limit? }` | `[{ session_id, name, profile_id, last_used_at }]` | Up to 10 recent sessions |
| `chat_delete_sessions` | `{ session_ids }` | `()` | Delete sessions by ID |
| `chat_rename_session` | `{ session_id, name }` | `()` | Rename via cc-sdk |
| `chat_resume_session` | `{ session_id }` | `{ session_id }` | Resume a session |
| `chat_close_session` | `{ session_id }` | `()` | Kill client, remove |
| `chat_set_permission_mode` | `{ session_id, mode }` | `()` | Set permission mode |
| `chat_get_token_usage` | `{ session_id }` | `{ context_pct, subscription_pct }` | From token tracker |
| `chat_cancel` | `{ session_id }` | `()` | Cancel in-progress |
| `chat_undo` | `{ session_id }` | `()` | Undo last user message |
| `chat_redo` | `{ session_id }` | `()` | Redo last undone message |

### Tauri Events (Rust → Frontend)

| Event | Payload | Description |
|-------|---------|-------------|
| `chat-output` | `{ session_id, content, part_type }` | Streamed message fragment |
| `session-state` | `{ session_id, state, message? }` | State transition |
| `permission-request` | `{ session_id, tool_name, payload }` | Needs approval |
| `tool-call` | `{ session_id, tool_id, tool_name, input }` | Tool executing |
| `tool-result` | `{ session_id, tool_id, result }` | Tool completed |
| `permission-auto-approved` | `{ session_id, tool_name }` | Auto-approved via allowlist |
| `permission-approved` | `{ session_id, tool_name }` | User approved (adds to allowlist) |
| `rate-limit` | `{ session_id, limit, reset_in }` | Rate limited |
| `result` | `{ session_id, usage, duration, output }` | End of turn |

### AppState Changes

```rust
// New chat-related state
pub struct ChatSession {
    pub client: ClaudeSDKClient,
    pub permission_mode: PermissionMode,
    pub state: SessionState,
    pub cwd: PathBuf,
    pub session_name: String,
}

// In AppState
chat_sessions: Mutex<HashMap<SessionId, ChatSession>>,
```

### Environment Variables

Profile env vars passed via `ClaudeCodeOptions::env`:

```rust
// Read ~/.claude/settings.json first (preserves user global vars), then merge profile vars
let base_env = read_settings_env().unwrap_or_default(); // reads settings["env"]
let profile_env = build_full_env_map(profile);          // profile ANTHROPIC_* vars
let merged_env: HashMap<String, String> = base_env.chain(profile_env).collect(); // profile vars override base

let options = ClaudeCodeOptions::default()
    .env(merged_env)
    .cwd(directory)
    .setting_sources(vec![SettingSource::Project]);
let client = ClaudeSDKClient::with_transport(options, Box::new(transport));
```

---

## Frontend Components

### Package.json Additions

```json
{
  "@assistant-ui/react": "^0.12"
}
```

Note: `@assistant-ui/react-ink` NOT needed — depends on `ink` (CLI terminal React). `ChatModelAdapter` interface from `@assistant-ui/react`. Custom `TauriChatModelAdapter` implements it. No `@anthropic-ai/sdk` in frontend — all Claude Code communication goes through Rust `cc-sdk`.

### TauriChatModelAdapter

Implements `ChatModelAdapter` from `@assistant-ui/react`:

```typescript
interface TauriChatModelAdapter {
  run({ messages, abortSignal, context }): AsyncGenerator<ChatModelRunResult> | Promise<ChatModelRunResult>;
}
```

- `run()` → `invoke('chat_send_message')` — sends messages to Rust
- `runConfig.model` from context → passed to cc-sdk as model override
- AbortSignal wired to `invoke('chat_cancel')`
- Response streamed back via Tauri event listener → `ChatModelRunResult` chunks
- Does NOT manage session state — cc-sdk (Rust) owns sessions

### Session State in List Item

```typescript
type SessionState = 'idle' | 'thinking' | 'request_input' | 'request_permission' | 'error';

// In session list item:
<span className={`state-icon state-${state}`}>
  {state === 'idle' && <DotIcon />}
  {state === 'thinking' && <AnimatedDots />}
  {state === 'request_input' && <InputIcon />}
  {state === 'request_permission' && <ShieldIcon />}
  {state === 'error' && <ErrorIcon />}
</span>
```

### Status Bar Component

```typescript
interface StatusBarProps {
  contextPct: number;      // 0-100
  subscriptionPct: number; // 0-100
  gitBranch: string;
  gitDirty: boolean;
  sessionState: SessionState;
}
```

### Permission Mode Badge

```typescript
const permissionColors = {
  default: 'bg-gray-500/20 text-gray-400',
  auto_accept_edits: 'bg-green-500/20 text-green-400',
  plan_mode: 'bg-blue-500/20 text-blue-400',
};
```

---

## Tauri Permissions

New capability `chat.json`:

```json
{
  "identifier": "chat",
  "description": "Chat window capabilities",
  "windows": ["chat"],
  "permissions": [
    "core:event:allow-listen",
    "core:event:allow-emit",
    "core:window:allow-close",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-unmaximize",
    "core:window:allow-set-size",
    "core:window:allow-set-title",
    "core:tray:allow-set-icon",
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-write-text",
    "dialog:allow-open",
    "fs:allow-read"
  ]
}
```

Capabilities `terminal.json` and `default.json` unchanged.

---

## Permission Allowlist

Reduces repetitive permission prompts. When user approves a command (e.g., `grep`), similar future commands auto-approve silently.

### How It Works

1. User approves a permission request (e.g., `grep *.ts`)
2. System extracts the **command family** — `grep` — and stores it in the allowlist
3. Future `grep` invocations (any args) auto-approve without prompting
4. Allowlist is **command-name only** — no arg matching (prevents regex edge cases)

### Allowlist Entry

```json
{
  "command": "grep",
  "approved_at": "2026-04-20T10:00:00Z",
  "approved_count": 42
}
```

### Storage

- File: `{app_data_dir}/permission_allowlist.json`
- Global across all profiles (no per-profile override)

### UI — Allowlist Manager

Accessible via tray menu → Settings → Permissions tab (shared with profile settings):

```
┌─────────────────────────────────────────────────────┐
│  Permissions                                    [x] │
├─────────────────────────────────────────────────────┤
│  Allowed Commands                                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ grep                       approved 42×   [×] │  │
│  │ find                       approved 12×   [×] │  │
│  │ cat                        approved 8×    [×] │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [Clear All]                                        │
│                                                     │
│  Note: Command names only. Glob patterns not        │
│  supported. Separate commands require separate      │
│  approvals.                                         │
└─────────────────────────────────────────────────────┘
```

- **Remove [×]**: removes command from allowlist (next `grep` will prompt)
- **Clear All**: empties allowlist
- Add via approval only (no manual add — must earn it)

### Rust Side (cc-sdk integration)

When cc-sdk emits a `permission-request` event:

```rust
fn should_auto_approve(cmd: &str, allowlist: &[String]) -> bool {
    let command = cmd.split_whitespace().next().unwrap_or(cmd);
    allowlist.iter().any(|entry| entry.command == command)
}
```

- If `should_auto_approve` returns true → emit `permission-auto-approved` event (no prompt), proceed
- If false → emit `permission-request` as normal, prompt user
- On user approval → add command to allowlist, emit `permission-approved` event

### Tauri Commands

| Command | Args | Returns | Description |
|---------|------|---------|-------------|
| `chat_get_allowlist` | — | `[{ command, approved_at, approved_count }]` | Get all allowed commands |
| `chat_remove_from_allowlist` | `{ command }` | `()` | Remove a command |
| `chat_clear_allowlist` | — | `()` | Clear entire allowlist |

### Tauri Events

| Event | Payload | Description |
|-------|---------|-------------|
| `permission-auto-approved` | `{ session_id, tool_name }` | Auto-approved via allowlist |
| `permission-approved` | `{ session_id, tool_name }` | User approved (adds to allowlist) |

### Out of Scope for Allowlist

- Glob/regex patterns in allowlist (too complex, abuse potential)
- Wildcards (e.g., `git *` — too broad)
- Time-based expiry (future feature)
- Per-user/group rules on multi-user systems

---

## Audio

- File: `src/assets/notification.mp3` (bundled)
- Play via `new Audio('/notification.mp3').play()` on all `session-state` transitions except `thinking`
- Volume: 0.5 (50%)

---

## Localization

All UI strings externalized via `i18next` (existing in project). New strings added to `src/lib/i18n.ts`.

| Namespace | Contents |
|-----------|----------|
| `chat` | Session list, composer placeholders, status labels |
| `permissions` | Allowlist UI, approve/deny labels |
| `common` | Shared: cancel, save, delete, error messages |

Translation keys follow pattern: `{component}.{element}.{state}`
Example: `chat.sessionList.newSession`, `chat.statusBar.contextPct`, `permissions.allowlist.clearAll`

---

## Out of Scope

- Tab bar at top of chat panel (sidebar is navigation)
- Split pane / multi-column chat
- Rich message editor (markdown rendering is assistant-ui default)
- Message reactions / thumbs up-down
- Session search / filter in sidebar
- Mobile / touch layout
- Chat window reopening with restored sessions (fresh open only)

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `src-tauri/src/chat.rs` | Chat session management, cc-sdk client lifecycle |
| `src-tauri/src/commands_chat.rs` | Tauri command handlers |
| `src/components/ChatWindow.tsx` | Main chat layout |
| `src/components/TauriChatModelAdapter.ts` | ChatModelAdapter implementation |
| `src/components/SessionList.tsx` | Sidebar session list + session menu |
| `src/components/SessionManagement.tsx` | Settings → Sessions tab |
| `src/components/StatusBar.tsx` | Floating status bar |
| `src/components/PermissionBadge.tsx` | Permission mode indicator |
| `src/lib/audio.ts` | Audio notification player |
| `src-tauri/src/permission_allowlist.rs` | Allowlist persistence + matching |
| `src/assets/notification.mp3` | Notification sound |
| `src-tauri/capabilities/chat.json` | Chat window permissions |
| `src-tauri/tauri.conf.json` (update) | Add chat window config |

### Modified Files

| File | Changes |
|------|---------|
| `src-tauri/src/lib.rs` | Register `chat::*` commands, add `chat_sessions` to state |
| `src-tauri/src/state.rs` | Add `ChatSession`, `PermissionMode`, `SessionState` |
| `src-tauri/Cargo.toml` | Add `cc-sdk`, `tokio` with macros |
| `src-tauri/tauri.conf.json` | Add `chat` window config |
| `package.json` | Add `@assistant-ui/react` |
| `src/tray.ts` / `src-tauri/src/tray.rs` | Add "Open Chat" menu item |
| `src/App.tsx` | Route by window label (`chat` vs `terminal`) |

---

## Implementation Order

1. **Rust backend scaffold**: add cc-sdk dep, `ChatSession` state, event emission skeleton
2. **Tauri commands**: create/send/list/close session commands
3. **Tauri event channels**: wire cc-sdk output → frontend events
4. **Frontend shell**: new chat window, basic routing by window label
5. **TauriChatModelAdapter**: ChatModelAdapter implementation, send/receive via invoke
6. **assistant-ui integration**: Thread, Composer, basic messages
7. **Session list + state icons**: sidebar with state indicators
8. **Session menu**: [+] dropdown with recent sessions + new session item
9. **Status bar**: context %, subscription %, git status
10. **Permission mode**: shift+tab, badges
11. **Attachments**: drag/drop, chips, file sending
12. **Slash commands + mentions**: assistant-ui primitives
13. **Chain of thought**: inline expandable
14. **Audio notifications**: play on permission/error
15. **Permission allowlist**: auto-approve tracked commands
16. **Permission allowlist UI**: show/clear list in settings
17. **Session management UI**: delete selected/outdated/small in settings
18. **Session rename**: double-click in sidebar
