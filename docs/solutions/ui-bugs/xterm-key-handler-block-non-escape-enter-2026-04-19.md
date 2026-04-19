---
module: terminal
date: "2026-04-19"
problem_type: ui_bug
component: frontend_stimulus
severity: medium
root_cause: wrong_api
resolution_type: code_fix
tags:
  - xterm.js
  - terminal
  - key-event-handling
  - tauri
---

# xterm.js key handler blocked non-ESC/Enter keys on session exit

## Problem

When a PTY session exited, the terminal showed "ESC: close / Enter: new session" and registered an `onData` handler to intercept ESC and Enter. However, `onData` fires **after** the PTY has already processed the key — there is no way to suppress input at this stage. Any keypress would reach the PTY, causing unintended session closes.

## Symptoms

- Any key (letters, numbers, arrow keys, etc.) pressed while session was active would close it
- Only ESC and Enter should control session lifecycle; all other keys were also closing sessions
- `onData` is fire-and-forget at the PTY level — returning from the handler does not undo PTY processing

## What Didn't Work

Using `st.terminal.onData()` to handle key events:

```typescript
st.terminal.onData((data) => {
  const code = data.charCodeAt(0);
  if (code === 27) {       // ESC
    closeSession();
  } else if (code === 13) { // Enter
    openNewSessionDialog();
    closeSession();
  }
  // Other keys still reached PTY — no way to block them
});
```

`onData` fires after raw PTY input has been queued. No mechanism to suppress.

## Solution

Use `attachCustomKeyEventHandler` instead. It fires **before** the PTY sees the input, allowing `return false` to block propagation entirely.

```typescript
const handler = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    setExitedSessionId(null);
    closeSession(id).catch(console.error);
    removeSession(id);
    disposeTerminal(id);
    syncSessions();
    return false; // block from PTY
  }
  if (e.key === 'Enter') {
    setExitedSessionId(null);
    setNewSessionDir(cwd);
    setShowNewSession(true);
    closeSession(id).catch(console.error);
    removeSession(id);
    disposeTerminal(id);
    syncSessions();
    return false; // block from PTY
  }
  // Block all other keys — don't close
  return false;
};
st.terminal.attachCustomKeyEventHandler(handler);
```

## Why This Works

`attachCustomKeyEventHandler` is a pre-process gate that runs before xterm.js forwards keyboard events to the PTY. Returning `false` from the handler tells xterm.js to consume the event — it never reaches the PTY.

- ESC: close session, block event
- Enter: close session and open new session dialog with cwd, block event
- Everything else: block silently, no session interaction

`onData` was the wrong API because it fires post-PTY — it cannot suppress keystroke propagation.

## Prevention

- When integrating terminal input handlers, prefer pre-process hooks (`attachCustomKeyEventHandler`) over post-process handlers (`onData`) when suppression is needed
- Always verify that key event handlers are checked **before** PTY consumption, not after
- If a key should be intercepted without reaching the underlying terminal/shell, the handler must return `false` to prevent propagation
- Use `KeyboardEvent.key` (e.g., `e.key === 'Escape'`) over char codes — reliable across keyboard layouts

## Related Issues

- `c94258c` — fix: block non-ESC/Enter keys on session exit
- `4a282f7` — feat: ESC closes session, Enter opens new session dialog with cwd
