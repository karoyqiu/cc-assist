---
date: 2026-04-16
topic: chat-native-gui
---

# Chat-Native GUI for cc-assist

## Problem Frame

cc-assist currently wraps Claude Code CLI in a PTY (pseudo-terminal), displaying raw ANSI output in an xterm.js terminal. This is the TUI model. The goal is to replace it with a chat-native UI — polished message bubbles, markdown rendering, code blocks — where Claude Code runs invisibly under the hood via the `cc-sdk`.

**Who benefits:** Developers who want a modern chat UX instead of watching Claude type in a terminal. Same profile/session model, better UI.

## Requirements

**Chat Messaging**

- R1. Messages render as user/assistant bubbles with distinct styling (user right-aligned, assistant left-aligned)
- R2. Assistant responses render full markdown: headings, bold/italic, inline code, code blocks with syntax highlighting and copy button
- R3. Code block copy button copies to clipboard on click
- R4. Streaming responses render token-by-token as they arrive (no waiting for complete response)
- R5. Tool calls display as structured cards showing tool name and arguments, followed by result
- R6. Error messages from the SDK render in a distinct error style

**Session Management**

- R7. A session = one working directory + one profile. Live sessions exist in memory (like open files in an editor).
- R8. Session list in left sidebar shows all live (open) sessions with directory name + profile color indicator + current state indicator
  - States: `idle`, `running`, `waiting_permission`, `waiting_input`
  - State shown as a text label or icon next to the session name
- R9. "New session" button in sidebar header shows a dropdown menu with:
  - "New session" → opens new-session dialog (picks profile + directory)
  - Separator
  - Up to 10 most recent sessions from Claude Code's session store, each with directory name + last active time. Click to resume directly.
  - Separator
  - "Manage sessions..." → opens Session Manager UI (R14)
- R10. Switching sessions switches the chat view — no terminal panes
- R11. Closing a live session: removes from memory (does not delete). Session remains in Claude Code's internal session store.
  - Per-session: hover session item → "×" button to close that live session
- R12. Session history: chat messages persist for the lifetime of the live session (cleared on close from memory)
- R13. Notification sound plays when a session transitions to `idle`, `waiting_permission`, or `waiting_input` state. Sound only plays if the app window does not have focus.

**Session Resume**

- R14. A dedicated "Session Manager" UI lists all sessions stored in Claude Code's internal session store (across all directories)
- R15. The manager shows session metadata: directory path, last active time, last message preview
- R16. Opening/Resuming a session from the manager loads it into a live chat session (new or existing tab)
- R17. When resuming, the session's original profile is shown but user can switch to a different profile before resuming
- R18. Investigator: does cc-sdk support renaming sessions (session label/tag)? If yes, use SDK. If no, read/write session metadata ourselves (where does Claude Code store session metadata — config file, SQLite, JSON?).
- R19. Investigator: confirm whether cc-sdk exposes session list/management APIs, or whether we need to call `claude sessions list` CLI command to enumerate sessions

**Status Bar**

- R20. A persistent status bar at the bottom of the chat area (above the input) shows:
  - Git status: current branch + dirty/clean indicator (e.g. `main *`, `feature/gui`)
  - Context usage: percentage of context window used (e.g. `62%`)
  - Subscription usage: percentage of subscription budget used (e.g. `8%`)
  - Editing mode: current permission mode (e.g. `default`, `auto-accept`, `plan`)
- R21. Status bar values update in real-time as the conversation progresses

**Input**

- R22. Text input at bottom of chat area, multi-line (shift+enter for newline, enter to send)
- R23. Send button activates when input is non-empty
- R24. While a response is streaming, input remains enabled. Sending a new message while streaming queues it — the stream completes normally, then the queued message is sent as the next turn.
- R25. "Stop" button appears during streaming to cancel the in-flight request
- R26. Attachment button in input bar: attaches files/images to the message being composed (content appended to send)
- R27. Model selector in input bar: dropdown showing the current model's display name (mapped from active profile's model config). Changing it overrides the profile default for this session only.
- R28. When context usage reaches 80% of the auto-compact threshold, a "Compact" button appears inline next to the input (before the send button). Clicking it triggers Claude's context compaction manually. The threshold is when Claude would normally auto-compact — this gives the user control to do it proactively.
- R29. Shift+Tab cycles the permission mode shown in the status bar (e.g. `default` → `auto-accept` → `plan` → `default`)

**Profile Integration**

- R30. Profile picker in new-session dialog (same provider list as current settings UI)
- R31. Active profile color shown in session list item and chat header
- R32. Switching active profile in settings does not interrupt any in-flight session

**Settings & Profile Editor**

- R33. Profile editor UI (name, API key, base URL, models) unchanged from current — already exists
- R34. Settings window opens via tray menu or keyboard shortcut (same as today)

## Success Criteria

- SC1. User can create a chat session with a chosen profile and directory
- SC2. User can send messages and receive streaming markdown responses
- SC3. Code blocks in responses are syntax-highlighted and copyable
- SC4. User can switch between multiple open sessions
- SC5. Session list shows active profile color and state per session
- SC6. Stop button cancels in-flight streaming
- SC7. Profile editor still works without disruption
- SC8. Notification sound plays when session becomes idle or waiting (when app is not focused)
- SC9. Session Manager UI shows all stored sessions from Claude Code's session store
- SC10. User can resume any stored session from the manager into a live chat
- SC11. Sessions can be renamed and the rename persists
- SC12. Status bar shows git status, context usage, and subscription cost in real-time
- SC13. Compact button appears in input bar when context nears the auto-compact threshold

## Scope Boundaries

- Out of scope: terminal/PTY mode (replaced entirely — no dual-mode)
- Out of scope: cross-session history (no global conversation history across sessions)
- Out of scope: light mode (dark only, matching current design)
- Out of scope: MCP server support for initial version

## Key Decisions

- **SDK: `cc-sdk` (ZhangHanDong/claude-code-api-rs)** — 154 GitHub stars, 5k downloads, active development, WebSocket-based streaming, full agent mode with tool calls. Embedded use (not running separate API server).
- **Frontend UI: `assistant-ui` (@assistant-ui/react)** — open-source React chat library (YC-backed, shadcn/ui-style primitives, streaming, markdown/code rendering, attachments, tool calls). Use as foundational layer, customize with project design system.
- **Architecture: Rust backend manages SDK sessions, streams events to React frontend** — Tauri event emit for streaming tokens, invoke() for commands. No WebSocket client in frontend.
- **Directory per session** — each chat session tied to a specific working directory (same model as current terminal sessions). Picked in new-session dialog.

## Dependencies / Assumptions

- D1. `cc-sdk` is added as a Cargo dependency in `src-tauri/Cargo.toml`
- D2. `assistant-ui` (`@assistant-ui/react`) added as a frontend dependency
- D3. Claude Code CLI is installed and on PATH (same assumption as today)
- D4. Profile credentials (API key, base URL) come from existing profile config — no change to settings storage
- ~~A1~~ ✅ Resolved: `cc-sdk` embedded mode via `SubprocessTransport` — no HTTP server required.
- ~~A2~~ ✅ Resolved: `.cwd()` for per-session directory; auth via `~/.claude/settings.json` which cc-assist already manages per-profile.

## Outstanding Questions

### Resolve Before Planning
*(all resolved — no blocking questions)*

### Deferred to Planning
- T1 (Technical): How to structure the Rust session state — per-session `InteractiveClient` instances vs a single client with session IDs
- T2 (Technical): How to emit streaming events from Rust to React — Tauri event channel capacity and backpressure
- T3 (Technical): How to handle tool calls — display structured cards vs let SDK auto-approve
- T4 (Needs research): How does cc-sdk enumerate Claude Code's stored sessions? Does it expose a `sessions list` API, or do we need to shell out to `claude sessions list` CLI command?
- T5 (Needs research): Where does Claude Code store session metadata (for rename)? Does cc-sdk expose a rename API, or do we need to find and edit the storage directly?
- T6 (Needs research): Does cc-sdk support queueing messages internally while a stream is in-flight? Or do we need to implement our own queue in the Rust backend?
- T7 (Needs research): Does cc-sdk expose context/token usage (for the status bar context meter) and per-session subscription cost? Or does it require reading Claude Code's internal usage reporting?

## Next Steps
→ `/ce:plan` for structured implementation planning
