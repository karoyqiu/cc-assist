---
title: "feat: Chat-native GUI for cc-assist"
type: feat
status: active
date: 2026-04-17
origin: docs/brainstorms/2026-04-16-chat-native-gui-requirements.md
---

# Chat-Native GUI for cc-assist

## Overview

Replace the PTY/xterm.js terminal UI with a chat-native interface — polished message bubbles, markdown rendering, code blocks with copy buttons, and streaming token display. Claude Code runs invisibly via `cc-sdk` (Rust backend), with the React frontend using `assistant-ui` primitives. The Tauri event system (`Channels`) streams tokens from Rust to React.

## Problem Frame

cc-assist currently wraps Claude Code CLI in a PTY, displaying raw ANSI output in an xterm.js terminal. This is a TUI model. The goal is a modern chat UX where Claude Code runs invisibly under the hood, with session management, streaming responses, structured tool call cards, and a status bar showing git/context/subscription state.

## Requirements Trace

- **R1-R6**: Chat messaging (bubbles, markdown, code blocks, streaming, tool cards, errors)
- **R7-R13**: Session management (live sessions, sidebar, new session menu, switching, closing, notifications)
- **R14-R19**: Session resume (Session Manager UI, metadata, resume, rename)
- **R20-R21**: Status bar (git status, context usage, subscription usage, permission mode)
- **R22-R29**: Input bar (multi-line, send/stop, queueing, attachments, model selector, compact button, Shift+Tab)
- **R30-R32**: Profile integration (picker, color indicator, non-disruptive profile switch)
- **R33-R34**: Settings window unchanged

## Scope Boundaries

- Out of scope: terminal/PTY mode (replaced entirely — no dual-mode)
- Out of scope: cross-session history
- Out of scope: light mode (dark only)
- Out of scope: MCP server support for initial version
- Out of scope: "Edit & Approve" for tool calls (Approve/Deny only in v1)

## Key Technical Decisions

- **SDK**: `cc-sdk` (ZhangHanDong/claude-code-api-rs) — `InteractiveClient` per session for independent state
- **Frontend**: `@assistant-ui/react` — `LocalRuntime` with `ChatModelAdapter` for streaming; `Thread`, `Message`, `Composer`, `Toolbar` primitives for UI
- **Streaming**: Tauri `Channel<T>` (not events) for token-by-token Rust→React streaming
- **Streaming pattern**: `send_message(prompt)` initiates the turn; `receive_messages_stream()` returns the token stream — these are separate operations
- **Streaming integration**: `LocalRuntime` + `ChatModelAdapter` where `run()` is `async *` yielding `ChatModelRunResult` chunks; Tauri `Channel<StreamChunk>` drives the iteration inside the adapter's async generator
- **Architecture**: Rust backend owns SDK session lifecycle; React uses `LocalRuntime` with `ChatModelAdapter` that calls Tauri `invoke()` and iterates the returned `Channel` as the streaming source
- **Message queue**: FIFO queue in Rust backend, queued messages shown in chat with visual indicator
- **Tool calls**: `ToolHandler` trait from cc-sdk; structured card UI with Approve/Deny (no edit in v1); `ChatModelAdapter.run()` yields `type: "tool-call"` entries
- **Session enumeration**: `cc_sdk::sessions::list_sessions()` for Session Manager
- **Session rename**: `cc_sdk::sessions::rename_session()` for Session Manager
- **Context/subscription**: `TokenUsageTracker` — manually updated from token counts in each SDK `Message`; no auto-polling API
- **Queue size**: Max 10 queued messages; beyond that, return error to user
- **InteractiveClient threading**: `InteractiveClient` is `!Send` and `!Sync` — use thread-per-session actor pattern (mpsc channel to command thread, same as `terminal.rs`)

## Open Questions

### Resolved During Planning

- **Queue visibility (Q1)**: Queued messages appear in chat immediately with a visual "queued" badge. Confirmed by R12 (messages persist in session) and R24 (queueing behavior).
- **Queue size (Q2)**: Hard limit of 10 queued messages. Beyond that, `send_message` returns a user-visible error.
- **Stream timeout (Q5)**: 60-second timeout on no tokens. Show "stalled" indicator and offer Cancel.
- **State event schema**: `{ session_id, state, previous_state, metadata }` where metadata includes `message_id` for streaming, `tool_call_id` for tool calls.

### Deferred to Implementation

- **Nested tool calls (Q4)**: LIFO approval order. Full stack display with indentation in v1.
- **"Edit & Approve" for tool calls (Q3)**: Out of scope for v1. Implement Approve/Deny only.
- **Context compaction trigger**: cc-sdk API for auto-compact threshold TBD — requires runtime investigation.

## Context & Research

### Relevant Code and Patterns

| Concern | Existing Pattern | File |
|---------|-----------------|------|
| Tauri command registration | `#[tauri::command]` + `generate_handler![]` | `src-tauri/src/commands.rs` |
| State management | `AppState` with `Mutex` for shared state | `src-tauri/src/state.rs` |
| Session lifecycle | Reader/command thread pattern with mpsc | `src-tauri/src/terminal.rs` |
| Event emission | `app.emit()` for state changes | `src-tauri/src/commands.rs` |
| Frontend invoke wrapper | `invoke<T>('command', {...})` | `src/lib/terminal.ts` |
| Frontend event listener | `listen<T>('event', handler)` with cleanup | `src/App.tsx` |
| Settings persistence | Atomic temp-file + rename | `src-tauri/src/config.rs` |

### External References

- **cc-sdk**: GitHub ZhangHanDong/claude-code-api-rs — `InteractiveClient`, `sessions::list_sessions()`, `sessions::rename_session()`, `TokenUsageTracker`, `ToolHandler` trait
- **assistant-ui**: `@assistant-ui/react` — `LocalRuntime` + `ChatModelAdapter` (async generator `run()` for streaming), `Thread`, `Message`, `Composer`, `Toolbar` primitives; `AssistantRuntimeProvider` wraps the runtime
- **Tauri Channels**: `tauri::ipc::Channel<T>` for Rust→React streaming (not events)

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  React Frontend (assistant-ui)                               │
│  ┌──────────┐  ┌───────────────────────────────────────────┐ │
│  │ Sidebar  │  │ Thread                                    │ │
│  │(sessions)│  │  ┌─────────────────────────────────────┐  │ │
│  └──────────┘  │  │LocalRuntime + ChatModelAdapter      │  │ │
│                │  │async *run() {                       │  │ │
│                │  │  invoke() → Channel → yield chunks }│  │ │
│                │  └─────────────────────────────────────┘  │ │
│                └───────────────────────────────────────────┘ │
│       ▲                    │                                 │
│       │                    ▼                                 │
│       │          Tauri invoke() + Channel                    │
│       │                    │                                 │
└───────┼────────────────────┼─────────────────────────────────┘
        │                    │
        │         ┌──────────┴──────────────┐
        │         │                         │
┌───────┼─────────┼─────────────────────────┼────────────────────┐
│  Rust │         │   Backend               │                    │
│       │         │                         │                    │
│  ┌────┴─────────▼─────────────────────────▼──────┐  ┌────────┐ │
│  │ SessionManager                                │  │NotifSvc│ │
│  │(per-session InteractiveClient + actor thread) │  │(sounds)│ │
│  └───────────────────────────────────────────────┘  └────────┘ │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  cc-sdk                                                  │  │
│  │  - send_message(prompt) → receive_messages_stream()      │  │
│  │  - TokenUsageTracker manually updated per Message        │  │
│  │  - ToolHandler trait for tool calls                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Event Schema

```typescript
// Streaming tokens (via Tauri Channel)
interface StreamChunk {
  session_id: string;
  message_id: string;
  chunk: string;
  done: boolean;
  error?: string;
}

// Session state transitions (via Tauri event)
interface SessionStateEvent {
  session_id: string;
  state: 'idle' | 'running' | 'waiting_permission' | 'waiting_input';
  previous_state?: string;
  metadata?: {
    message_id?: string;
    tool_call_id?: string;
    tool_name?: string;
  };
}

// Tool call (via Tauri event)
interface ToolCallEvent {
  session_id: string;
  tool_call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}
```

### Message Queueing

```
User sends M2 (M1 streaming)
  → queue.push(M2) in Rust backend
  → emit('message-queued', { session_id, message_id, position })
  → frontend shows M2 in chat with "queued" badge
  → when M1 stream completes, pop M2 from queue
  → send M2, transition to 'running'
```

## Implementation Units

- [ ] **Unit 1: Add dependencies — cc-sdk and assistant-ui**

**Goal:** Add both SDK dependencies to the project.

**Requirements:** D1, D2

**Dependencies:** None

**Files:**
- Modify: `src-tauri/Cargo.toml` — add `cc-sdk = "0.8"` (check latest version)
- Modify: `package.json` — add `@assistant-ui/react`
- Verify: cc-sdk version compatibility, assistant-ui peer dependencies (React 19, Vite)

**Approach:**
- Add cc-sdk to Rust dependencies via crates.io (`cc-sdk = "0.8"`). Verify latest version on crates.io before adding.
- Add assistant-ui to frontend dependencies. Check if it requires `@ai-sdk/react` or other peer deps.
- **Verify cc-sdk API surface before Units 2-4**: Inspect `docs.rs/cc-sdk` for `InteractiveClient` (confirm per-session cwd support via options or equivalent), `sessions::list_sessions()` and `sessions::rename_session()` signatures, `TokenUsageTracker` update API, and `ToolHandler` trait signature. If APIs differ from plan assumptions, update Units 2-4 before building.
- Run build to verify no conflicts.

**Verification:** Both packages import successfully.

- [ ] **Unit 2: Rust — SessionManager module**

**Goal:** Create `session_manager.rs` that wraps cc-sdk `InteractiveClient` per session, manages state transitions, and handles the message queue.

**Requirements:** R7, R8, R10, R12, R24, R25

**Note on threading**: `InteractiveClient` is `!Send` and `!Sync`. Use the same thread-per-session actor pattern as `terminal.rs` — a dedicated command thread owns the client, with an mpsc channel for sending commands (`send_message`, `tool_approve`, `tool_deny`, `stop`, `close`). The command thread runs `receive_messages_stream()` and forwards tokens via Tauri `Channel` to the frontend.

**Dependencies:** Unit 1

**Files:**
- Create: `src-tauri/src/session_manager.rs` — new module
- Create: `src-tauri/src/streaming.rs` — Channel-based streaming helpers
- Modify: `src-tauri/src/lib.rs` — register new module
- Modify: `src-tauri/src/state.rs` — add `ChatSessionHandle` to `AppState`

**Approach:**
- `ChatSessionHandle` holds an mpsc `Sender<ChatCommand>` to a dedicated actor thread that owns the `InteractiveClient`.
- Actor thread runs `receive_messages_stream()` loop, sending tokens via Tauri `Channel` as they arrive.
- State transitions emit `session-state` Tauri events.
- `send_message()`: if `running`, push to queue; if `idle`, send `ChatCommand::SendMessage` to actor and start streaming.
- Queue drain: when stream completes, pop next from queue and send `ChatCommand::SendMessage`.
- Implement tool call handling via `ToolHandler` trait.
- `TokenUsageTracker`: manually call `.update()` from token counts in each received `Message`.

**Technical design:**
```rust
// Pseudo-structure — directional guidance, not implementation spec
// NOTE: InteractiveClient is !Send/!Sync — must live on a single thread.
// Use actor pattern: command thread owns the client, mpsc for commands,
// receive_messages_stream() loop forwards tokens via Tauri Channel.
pub struct ChatSessionHandle {
    pub id: String,
    pub cmd_sender: mpsc::Sender<ChatCommand>, // to actor thread
    pub state: SessionState,
    pub message_queue: VecDeque<QueuedMessage>,
    pub current_message_id: Option<String>,
    pub name: String,
    pub profile_id: String,
    pub directory: PathBuf,
}

pub enum ChatCommand {
    SendMessage(String),           // user text
    ApproveTool(String, Value),   // tool_call_id, optional modified args
    DenyTool(String),              // tool_call_id
    SendInput(String),             // for waiting_input
    Stop,
    Close,
}

pub enum SessionState {
    Idle,
    Running { pending_tool: Option<ToolCallPending> },
    WaitingPermission { tool_call_id: String, tool_name: String, args: Value },
    WaitingInput,
}
```

**Patterns to follow:**
- Existing `terminal.rs` session pattern (thread per session, mpsc for commands)
- `AppState` mutex pattern from `state.rs`

**Test scenarios:**
- Happy path: create session, send message, receive streaming tokens, stream completes → idle
- Edge case: send message while running → queued
- Edge case: send 11th message while 10 queued → error returned
- Error path: stream times out after 60s → error shown, session idle

**Verification:** Session transitions through correct states; queue respects 10-message limit.

- [ ] **Unit 3: Rust — Tauri commands for chat session**

**Goal:** Expose chat session operations to the React frontend via Tauri commands and Tauri Channels.

**Requirements:** R7, R10, R24, R25, R28

**Dependencies:** Unit 2

**Files:**
- Create: `src-tauri/src/chat_commands.rs` — all chat-related commands
- Modify: `src-tauri/src/lib.rs` — register `chat_commands` module and its commands

**Approach:**
- `#[tauri::command] chat_create_session(profile_id, directory)` → returns session_id, emits session list update event
- `#[tauri::command] chat_send_message(session_id, content, on_chunk: Channel<StreamChunk>)` → sends `content` via `InteractiveClient::send_message()`, then iterates `receive_messages_stream()` sending tokens via `on_chunk` Channel; emits `session-state` events on transitions
- `#[tauri::command] chat_tool_approve(session_id, tool_call_id, modified_args: Option<Value>)`
- `#[tauri::command] chat_tool_deny(session_id, tool_call_id)`
- `#[tauri::command] chat_send_input(session_id, content)` — for `waiting_input` state
- `#[tauri::command] chat_stop(session_id)` — cancels in-flight request
- `#[tauri::command] chat_close_session(session_id)` — removes from memory, session persists in Claude Code store
- `#[tauri::command] chat_get_state(session_id)` → returns current state
- `#[tauri::command] chat_get_sessions()` → list live sessions with state
- `#[tauri::command] chat_get_usage(session_id)` → returns context %, subscription %
- `#[tauri::command] chat_compact_context(session_id)` → triggers context compaction; returns updated context %

**Patterns to follow:** Command handler pattern from `commands.rs`

**Test scenarios:**
- Happy path: create session, send message, receive tokens via Channel, complete
- Tool call: send message → tool call detected → emit tool-call event → approve → stream continues
- Queue: send while running → queue → drain → send queued

**Verification:** Each command works end-to-end with frontend integration.

- [ ] **Unit 4: Rust — Session Manager (list/resume/rename)**

**Goal:** Implement Session Manager using cc-sdk's session APIs.

**Requirements:** R14-R19

**Dependencies:** Unit 2

**Files:**
- Modify: `src-tauri/src/chat_commands.rs` — add session manager commands

**Approach:**
- `#[tauri::command] chat_list_stored_sessions()` → calls `cc_sdk::sessions::list_sessions()`, returns metadata (id, name, directory, last_active)
- `#[tauri::command] chat_resume_session(session_id, profile_id, directory)` → creates new `ChatSessionHandle` from stored session
- `#[tauri::command] chat_rename_session(session_id, name)` → calls `cc_sdk::sessions::rename_session()`

**Verification:** Session Manager UI can list, resume, and rename stored sessions.

- [ ] **Unit 5: React — Chat UI shell with assistant-ui**

**Goal:** Replace `TerminalWindow.tsx` with a chat-native UI using assistant-ui primitives.

**Requirements:** R1-R6; R10 and R12 are cross-cutting concerns handled as part of this unit's integration responsibility

**Dependencies:** Unit 1, Unit 3

**Files:**
- Create: `src/components/ChatWindow.tsx` — main chat container
- Create: `src/components/ChatSidebar.tsx` — session list sidebar
- Create: `src/components/ChatInput.tsx` — input bar with model selector, attachment
- Create: `src/components/ChatStatusBar.tsx` — git, context, subscription, permission mode
- Create: `src/components/ToolCallCard.tsx` — structured tool call display
- Create: `src/components/SessionManagerDialog.tsx` — Session Manager UI
- Modify: `src/App.tsx` — route between TerminalWindowApp and ChatApp
- Modify: `src/lib/chat.ts` — frontend invoke wrappers for chat commands
- Modify: `src/types.ts` — add chat session types

**Approach:**
- Use assistant-ui `Thread` component as the chat container.
- `Message` component for user/assistant bubbles (styled per requirements: user right-aligned, assistant left-aligned).
- `Composer` + `Toolbar` for input bar.
- Custom components for tool call cards (`ToolCallCard`), status bar (`ChatStatusBar`), sidebar (`ChatSidebar`).
- `ChatInput` wraps assistant-ui's `Composer` with added model selector dropdown and attachment button.
- `LocalRuntime` with a custom `ChatModelAdapter`:
  - `run()` is `async *` — an async generator yielding `ChatModelRunResult` chunks
  - Inside the generator: call `invoke('chat_send_message', { session_id, content })` which returns a `Channel<StreamChunk>`
  - Iterate the channel, `yield` text chunks as `{ content: [{ type: "text", text }] }`
  - For tool calls, yield `{ content: [{ type: "tool-call", toolCallId, toolName, args }] }`
  - Pass `abortSignal` from `run()` to the Tauri command so cancellation works
- Subscribe to Tauri events for session state transitions (separate from streaming).
- Session Manager dialog: separate from the main chat Thread, uses different components.

**Patterns to follow:**
- `TerminalWindow.tsx` session switching pattern
- `App.tsx` event listener pattern with cleanup
- `terminal.ts` invoke wrapper pattern

**Test scenarios:**
- Happy path: send message → streaming tokens render in chat → complete message appears
- Markdown: assistant response with **bold**, `inline code`, ```code blocks``` renders correctly
- Code block: shows syntax highlighting and copy button
- Error: SDK error renders in distinct error style (R6)

**Verification:** Chat UI renders messages with correct styling; streaming tokens appear token-by-token.

- [ ] **Unit 6: React — Session sidebar**

**Goal:** Session list in left sidebar with state indicators and profile color.

**Requirements:** R7-R13, R31

**Dependencies:** Unit 5

**Approach:**
- `ChatSidebar` shows list of live `ChatSessionHandle` sessions.
- Each item: directory name + profile color indicator (left border) + state label/icon.
- State indicators: `idle` (checkmark), `running` (spinner), `waiting_permission` (pause icon), `waiting_input` (chat icon).
- Header: "New session" dropdown button with: "New session", separator, up to 10 recent sessions, separator, "Manage sessions...".
- Per-item hover: "×" close button.
- Clicking a session switches the chat view.

**Verification:** Sidebar shows all live sessions with correct state colors and indicators.

- [ ] **Unit 7: React — Input bar enhancements**

**Goal:** Input bar with multi-line text, send/stop button, model selector, attachment, compact button.

**Requirements:** R22-R29

**Dependencies:** Unit 5

**Approach:**
- Multi-line: `Composer` component handles Shift+Enter newline, Enter send.
- Send button activates when input non-empty.
- Stop button appears during streaming (replaces send button).
- Model selector: dropdown in toolbar, current model's display name from active profile's model config.
- Attachment button: attaches files/images to message content.
- Compact button: appears when context usage ≥ 80% of auto-compact threshold. Calls `chat_compact_context()` command.
- Shift+Tab: cycles permission mode in status bar (`default` → `auto-accept` → `plan` → `default`).

**Patterns to follow:** `TerminalWindow.tsx` input handling pattern

**Test scenarios:**
- Send with empty input: button disabled
- Streaming: stop button visible, send button hidden
- Queue: input always enabled during streaming (R24)
- Compact button: appears at 80% threshold
- Shift+Tab: cycles permission mode

**Verification:** All input behaviors match requirements.

- [ ] **Unit 8: React — Status bar**

**Goal:** Persistent status bar showing git status, context usage, subscription usage, permission mode.

**Requirements:** R20-R21

**Dependencies:** Unit 5

**Files:**
- Create: `src/components/ChatStatusBar.tsx`

**Approach:**
- `ChatStatusBar` subscribes to usage events from `chat_get_usage` polling during streaming.
- Git status: call `git rev-parse --abbrev-ref HEAD` and `git status --porcelain` via Rust command.
- Display format: `main *` (dirty) or `main` (clean), `62%` context, `8%` subscription, `default|auto-accept|plan`.
- Updates in real-time as conversation progresses (poll every 2s during streaming, or event-driven from Rust).
- Permission mode cycles on Shift+Tab (handled in `ChatInput`).

**Patterns to follow:** `TerminalWindow.tsx` event subscription pattern

**Verification:** Status bar shows correct values and updates during conversation.

- [ ] **Unit 9: React — Notification sounds**

**Goal:** Play notification sound on session state transitions when app window is not focused.

**Requirements:** R13

**Dependencies:** Unit 5

**Approach:**
- Play sound on transitions to `idle`, `waiting_permission`, `waiting_input`.
- Use `window.hasFocus()` to check if app is focused — if focused, no sound.
- Use Web Audio API or `<audio>` element for sound playback.
- Sound file: embed a small notification sound (e.g., Web Audio API-generated tone or small audio file).
- Store last focused state in a ref, check on each state transition.

**Verification:** Sound plays when session becomes idle/waiting while window is not focused.

- [ ] **Unit 10: Integration — end-to-end wiring**

**Goal:** Wire all pieces together. Remove PTY/xterm.js dependency from the main app.

**Requirements:** All R1-R34

**Dependencies:** Units 2-9

**Files:**
- Modify: `src/App.tsx` — use `ChatWindow` instead of `TerminalWindow` for main app
- Modify: `src-tauri/src/lib.rs` — remove terminal commands if unused
- Modify: `src-tauri/capabilities/default.json` — add Tauri permissions for Channels (verify exact permissions needed for `Channel` passed as invoke argument — may not need new capabilities)
- Modify: `src/lib/chat.ts` — new module for chat session invoke wrappers; `terminal.ts` is kept for settings window (it contains terminal session management code, not just settings)
- Remove: xterm.js packages from `package.json` (if not used elsewhere)

**Approach:**
- Ensure `ChatApp` loads by default instead of `TerminalWindowApp`.
- Verify all session operations work via chat commands.
- Verify streaming, tool calls, queueing all function correctly.
- Settings window still uses existing terminal font settings code (`terminal.ts` is kept).

**Verification:** Full chat flow works end-to-end; no PTY terminal in main window.

## System-Wide Impact

- **Removed surface**: PTY/xterm.js terminal is removed from main app window. Settings window still uses terminal font settings.
- **Event system change**: Streaming moves from `terminal-output` events to Tauri Channels. Other event patterns unchanged.
- **Session model change**: Sessions now owned by `SessionManager` in Rust, not `AppState.sessions` HashMap. Terminal sessions and chat sessions are separate.
- **No cross-contamination**: Terminal session commands and chat session commands are in separate modules.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| cc-sdk version incompatibility | Pin to known-working version; test streaming before full integration |
| assistant-ui peer dep conflicts with React 19 | Verify `@assistant-ui/react` supports React 19 before adding |
| Tauri Channel backpressure at high token rates | Buffer tokens in Rust, send every 5-10 tokens or 50ms |
| Tool call approval UX complexity | Scope to Approve/Deny only in v1; "Edit" deferred |
| cc-sdk session enumeration perf | `list_sessions()` may be slow; show loading state |
| Removing xterm.js breaks settings window | Keep `terminal.ts` and `TerminalWindow` for settings window only |

## Dependencies / Prerequisites

- D3: Claude Code CLI installed and on PATH (unchanged assumption)
- D4: Profile credentials from existing config (unchanged assumption)
