# Terminal Window Design

## Overview

Embed an interactive Claude CLI terminal inside the app using `@xterm/xterm` (frontend) and `portable-pty` (Rust backend). The terminal runs in a separate Tauri window, styled per the existing design system but using pt for sizing.

## Window

- **Type:** Separate Tauri window (`label: "terminal"`)
- **Default size:** 800pt × 600pt
- **Resizable:** Yes
- **Persistence:** Independent — window state (size, position, open/closed) persists across app restarts
- **Open trigger:** Tray menu "Open Terminal" or main window button
- **Close behavior:** Window closes when last session is closed

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  Sidebar (240pt fixed)  │  Terminal Panel (flex-1)      │
│  ┌──────────────────┐   │  ┌────────────────────────┐   │
│  │ Sessions     [+] │   │  │ profile / directory   │   │
│  ├──────────────────┤   │  ├────────────────────────┤   │
│  │ session-name     │   │  │                        │   │
│  │ session-name ×   │   │  │  xterm.js terminal     │   │
│  │ session-name     │   │  │  (fills remaining)     │   │
│  │                  │   │  │                        │   │
│  ├──────────────────┤   │  │                        │   │
│  │           [⚙]   │   │  └────────────────────────┘   │
│  └──────────────────┘   │                               │
└──────────────────────────────────────────────────────────┘
```

- Sidebar: 240pt fixed width, full height, border-right
- Terminal panel: fills remaining space
- No rounded corners on sidebar/terminal (matching existing design system)

## Sidebar

### Header
- Label: "Sessions" (text-sm, muted color)
- New session button: "+" icon (shadcn `size="icon"`)

### Session List
- Each item: clickable row, padding `py-5`
- Session name: `{directory basename} ({profile name})`, text-sm
- Active item: surface background + subtle left border accent
- Hover: surface background
- Close button (×): appears on hover, right-aligned on the row

### Empty State
- Centered message: "No sessions" (text-sm, muted)
- Subtext: "Click + to start a new session"

### Bottom Bar
- Settings button (⚙) — opens settings window via `toggle_settings_window`
- Locale switcher (future, not in scope)

## Terminal Panel

### Empty State
- Centered: "Select a session to begin" (text-sm, muted)

### Active Session Header Bar
- Compact bar (24pt height) above the terminal
- Shows: `{profile name} — {full directory path}` (text-xs, muted, monospace)
- Left-aligned

### Terminal Area
- xterm.js fills all remaining space
- Font: user-configurable monospace font, default 14pt
- Font settings stored in the profiles config or global terminal settings
- Changing font size triggers xterm `AddonFit::fit()` recalculation
- Color scheme: dark (matches app background `#0F0F0F`)
- Fits terminal using `@xterm/addon-fit`

### Terminal Font Settings
```typescript
interface TerminalFontSettings {
  fontFamily: string;   // e.g. "Cascadia Code", "Fira Code", "Consolas"
  fontSize: number;     // in pt, default 14
}
```
- Settings accessible via settings panel (⚙ button in sidebar)

## New Session Flow

1. User clicks "+" in sidebar
2. If no sessions exist yet, pre-fill from main app context:
   - **Profile:** currently active profile
   - **Directory:** last used directory for that profile
3. System spawns PTY in the chosen directory using the selected profile's env vars (same temp-settings approach as `launch_claude_in_directory`, but for PTY stdin/stdout instead of `cmd /c start`)
4. New session added to sidebar list and set as active
5. PTY output begins streaming to xterm

## PTY / Rust Architecture

### Module Structure
```
src-tauri/src/
  terminal.rs   # PTY session management (new file)
  lib.rs        # registers terminal::* commands in generate_handler!
```

### Session State
```rust
// In AppState
sessions: Mutex<HashMap<SessionId, SessionHandle>>
```

```rust
struct SessionHandle {
    worker: tokio::task::JoinHandle<()>,
    master: Arc<Mutex<portable_pty::MasterPty>>,
}
```

### PTY Setup (per session)
1. `portable_pty::native_pty_system().spawn_command(...)` with `claude --settings <temp-settings-path>`
2. Set raw mode on master
3. Spawn tokio task to read stdout in a loop and emit via `app.emit("terminal-output", TerminalPacket { session_id, data })`
4. Return `SessionId` (UUID) to frontend

### Tauri Commands

| Command | Args | Returns |
|---------|------|---------|
| `terminal_create_session` | `{ profile_id, directory }` | `{ session_id }` |
| `terminal_write` | `{ session_id, data }` | `()` |
| `terminal_resize` | `{ session_id, cols, rows }` | `()` |
| `terminal_close_session` | `{ session_id }` | `()` |

### Output Event
```rust
// Tauri event "terminal-output"
struct TerminalPacket {
    session_id: String,
    data: String,  // UTF-8 output from PTY
}
```

### Session Naming
- `format!("{} ({})", dir.file_name().display(), profile_name)`
- If `file_name` is empty (root dir), use the full path

### Frontend State
```typescript
interface TerminalState {
  sessions: { id: string; name: string }[];
  activeSessionId: string | null;
}
```

### Frontend Event Handling
- Single persistent listener on `terminal-output`
- On receive: check `packet.session_id === activeSessionId`
- If match: write `packet.data` to xterm (via xterm `write()`)

## Input / Echo

- PTY runs in **raw mode** — child process sees each keystroke immediately
- **Local echo** — xterm.js handles echo locally (xterm `write()` for input echo is NOT needed; the shell/Claude echoes itself)
- Keystrokes from xterm sent character-by-character to Rust via `terminal_write`
- Ctrl+C forwarded as `0x03` byte (SIGINT) via `terminal_write`

## Clipboard

- **Copy:** xterm.js selection → system clipboard (via `@xterm/addon-clipboard` + Tauri clipboard plugin)
- **Paste:** right-click or Ctrl+Shift+V (xterm.js default)
- **No implicit paste on middle-click** (avoids accidental pastes)

### Tauri Clipboard Plugin
- `tauri-plugin-clipboard-manager` on Rust side
- Capability: `clipboard-manager:allow-write-text`, `clipboard-manager:allow-read-text`
- Frontend uses `@tauri-apps/plugin-clipboard-manager`

## Resize

- On window resize: xterm's `AddonFit::fit()` calculates cols/rows
- Frontend calls `terminal_resize` with new dimensions
- Rust calls `master.resize(pty::PtySize { cols, rows, ... })`

## Session Close

1. Frontend calls `terminal_close_session`
2. Rust: `master.kill()`, await worker task
3. Remove from `AppState.sessions` HashMap
4. Frontend: remove from sessions list
5. If was active: clear xterm, show empty state
6. If was last session: close window

## Dependencies

### Rust (Cargo.toml)
```toml
portable-pty = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "sync", "io-util"] }
tauri-plugin-clipboard-manager = "2"
```

### Frontend (package.json)
```json
"@xterm/xterm": "^5",
"@xterm/addon-fit": "^0.10",
"@xterm/addon-clipboard": "^0.10",
"@tauri-apps/plugin-clipboard-manager": "^2"
```

## Permissions (capabilities/terminal.json)

```json
{
  "$schema": "...",
  "identifier": "terminal",
  "description": "Terminal window capabilities",
  "windows": ["terminal"],
  "permissions": [
    "core:event:allow-listen",
    "core:event:allow-emit",
    "core:window:allow-close",
    "core:window:allow-set-size",
    "core:window:allow-show",
    "core:window:allow-hide",
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-write-text"
  ]
}
```

Note: `invoke()` calls to Rust commands do not need individual permissions. Only direct Tauri API calls require capability permissions.

## Design Notes

- All sizing uses pt (points) as the preferred unit, not px
- Typography: system default sans-serif for UI, user-configurable monospace for terminal
- Color palette: follows existing DESIGN.md (`#0F0F0F` background, `#1A1A1A` surfaces, `#2A2A2A` borders, `#E5E5E5` text, `#737373` muted)
- Active session accent: uses the profile's `icon_color`
- Window border-radius: 0 (no rounded corners on the window itself)

## Out of Scope

- Tab bar at top of terminal panel (sidebar is the navigation)
- Split panes / tmux-like arrangement
- Terminal window reopening with restored sessions (fresh open only)
- Multiple simultaneous terminal instances
