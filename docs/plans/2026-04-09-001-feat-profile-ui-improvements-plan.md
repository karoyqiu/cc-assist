---
title: Profile List & Tray UI Improvements
type: feat
status: active
date: 2026-04-09
origin: docs/brainstorms/2026-04-09-profile-ui-improvements-requirements.md
---

# Profile List & Tray UI Improvements

## Overview

Four targeted UX improvements to cc-assist: delete-before-confirmation, official profiles locked from editing, native OS checked state in the tray menu, and window close terminates the app.

## Problem Frame

Users can accidentally delete profiles with no confirmation. Profiles created from the "Claude Official" provider template are fully editable despite their origin. The tray menu marks the active profile and locale with `✓` text prefixes rather than native OS checkmarks. The app window closes to the tray instead of exiting.

## Requirements Trace

- R1–R4h: Delete confirmation dialog with loading/error states, keyboard trap, backdrop
- R5–R8: Official profiles (provider_id="anthropic") are read-only; no Delete/Duplicate buttons
- R9–R11: Tray menu uses native checked state via `CheckMenuItemBuilder`
- R12–R13: Window close exits app

## Scope Boundaries

- Custom profiles are fully editable and deletable — no change to existing behavior
- The "Quit" tray menu item is retained
- Only the "Claude Official" provider (id="anthropic") produces official profiles

## Context & Research

### Relevant Code and Patterns

| Pattern | File | Notes |
|---|---|---|
| Modal with backdrop | `src/components/DirectoryPicker.tsx` | Follow this pattern for confirmation dialog |
| Read-only field styling | `src/components/ProfileEditor.tsx` | `readOnly` prop; add border: none for R6 |
| Tray menu builder | `src-tauri/src/tray.rs` | `build_tray_menu`, `handle_menu_event`, `rebuild_menu` |
| Window lifecycle | `src-tauri/src/window.rs` | `toggle_settings_window` uses `window.hide()` |
| Config persistence | `src-tauri/src/config.rs` | Schema migration for `provider_id`; follows atomic write pattern |
| Profile creation | `src/App.tsx:handleAddWithProvider` | Copies `provider.name/icon/base_url` but NOT `provider.id` |

### External References

- Tauri 2.x `CheckMenuItemBuilder::with_id(id).checked(bool)` — confirmed available
- Tauri 2.x `CheckMenuItem::set_checked(checked)` — mutable without rebuild; rebuild approach also valid

### No Institutional Learnings

`docs/solutions/` does not exist in this project. No prior solutions for these patterns.

## Key Technical Decisions

- **`provider_id` field**: Added as `Option<String>` to `ProfileConfig` in both TypeScript and Rust. `None` means custom (non-official). Official = `Some("anthropic")`. Existing profiles without the field are treated as custom (safe — user-created).
- **Migration acceptance:** Pre-change profiles with `base_url=https://api.anthropic.com` but no `provider_id` field remain editable (treated as custom). This is by design — `provider_id` is the authoritative marker, not `base_url`. If a user created a custom profile using the Anthropic base URL before this change, it is and remains editable. No migration of old profiles is performed.
- **Delete dialog implementation**: Inline modal in `ProfileEditor.tsx` following the `DirectoryPicker` backdrop/centered-box pattern. No external dialog library.
- **Tray checked state**: Use `CheckMenuItemBuilder` with `.checked(is_active)` per item. Menu still rebuilds on profile/locale change (current architecture; both rebuild and mutable-checked approaches are valid).
- **Window close → exit**: Change `window.hide()` in `toggle_settings_window` to emit a window-close event that calls `app.exit(0)`. Investigate `on_window_close` handler in `lib.rs` setup.
- **Duplicate → custom**: Duplicating an official profile produces a custom profile with `provider_id = None`.

## Open Questions

### Resolved During Planning

- **Tauri `CheckMenuItemBuilder` API**: Confirmed via docs.rs/tauri 2.9.5 — `CheckMenuItemBuilder::with_id(id).checked(bool).build(app)` is valid. Checked state is also mutable via `CheckMenuItem::set_checked()` without rebuild.
- **Window close current behavior**: `window.rs:toggle_settings_window` calls `window.hide()`. No `preventClose` flag in `lib.rs`. App stays alive via tray icon (comment in lib.rs confirms this).

### Deferred to Implementation

- Whether to use mutable `set_checked()` or rebuild approach for tray checked state — rebuild is fine given current architecture

## Implementation Units

- [ ] **Unit 1: Add `provider_id` to ProfileConfig schema**

**Goal:** Add `provider_id: Option<String>` to `ProfileConfig` in both TypeScript and Rust, enabling official profile detection.

**Requirements:** R5

**Dependencies:** None

**Files:**
- Modify: `src/types.ts` — add `provider_id?: string` to `ProfileConfig` interface
- Modify: `src-tauri/src/types.rs` — add `#[serde(skip_serializing_if = "Option::is_none")] pub provider_id: Option<String>` to `ProfileConfig`
- Modify: `src-tauri/src/config.rs` — ensure migration: profiles without `provider_id` are treated as `None` (safe default; existing profiles are user-created)
- Test: `src-tauri/src/config.rs` — add test for migration: existing profile without `provider_id` deserializes with `provider_id = None`

**Approach:** Add `provider_id: Option<String>` to `ProfileConfig` in both TypeScript and Rust. Existing JSON config will deserialize `provider_id` as absent → `None`. New profiles via `handleAddWithProvider` set `provider_id = provider?.id ?? null` to always track the origin provider. Official = `provider_id === 'anthropic'`; custom = `provider_id === null`.

**Patterns to follow:** Existing `#[serde(skip_serializing_if = "Option::is_none")]` pattern for optional fields in `types.rs`

**Test scenarios:**
- Happy path: New profile created from "Claude Official" provider has `provider_id = "anthropic"`; custom profile has `provider_id = null`
- Migration: Existing profile in config.json without `provider_id` field deserializes to `None` and is editable (non-official)
- Rust deserialization: `serde_json::from_str` of profile with no `provider_id` yields `provider_id: None`
- Round-trip: profile with `provider_id = "anthropic"` goes through TypeScript serialize → Rust config write → Rust config read → TypeScript deserialize; `provider_id` remains `"anthropic"` throughout

**Verification:** Both TypeScript and Rust compile with the new field. Config round-trips correctly. Official profile detection is tested in Unit 3 scenarios (official profile fields read-only, no Delete/Duplicate buttons).

---

- [ ] **Unit 2: Delete confirmation dialog**

**Goal:** Show a confirmation dialog before deleting a profile, with the profile name displayed, keyboard/trap/escape support, loading and error states.

**Requirements:** R1–R4, R4a–R4h

**Dependencies:** None (independent UI work)

**Files:**
- Modify: `src/components/ProfileEditor.tsx` — add `ConfirmDialog` sub-component and state (`showDeleteConfirm`, `deleting`, `deleteError`); change `onDelete` prop to `Promise<boolean>`
- Modify: `src/App.tsx` — change `handleSaveProfiles` to return `boolean`; change `handleDeleteProfile` to `async`/`return await handleSaveProfiles(...)`

**P0 Fix — Error propagation:** `handleDeleteProfile` in `App.tsx` must propagate failures so the dialog can display `deleteError`. Change `handleSaveProfiles` to return `boolean` (success/failure). Make `handleDeleteProfile` `async` and `return await handleSaveProfiles(remaining)`. Propagate failure to `ProfileEditor` via `onDelete` callback — change `onDelete` signature to `onDelete: (id: string) => Promise<boolean>` (false = delete failed, dialog stays open with error). If delete succeeds, `setSelectedId(newActive)` and close dialog.

**Approach:**
- Add `useState` for `showDeleteConfirm: boolean`, `deleting: boolean`, `deleteError: string | null`
- Change `onDelete` prop type to `(id: string) => Promise<boolean>` — caller checks return value
- Change `onClick={() => onDelete(draft.id)}` on Delete button to async handler that calls `setShowDeleteConfirm(true)` first; on confirm, `setDeleting(true)`, call `const ok = await onDelete(draft.id)`, set `deleting(false)`, if `!ok` set `deleteError(...)` else close dialog
- Add `ConfirmDialog` component rendered inside `ProfileEditor` when `showDeleteConfirm` is true
- `ConfirmDialog` renders: backdrop div (semi-transparent, fixed inset), centered dialog box with profile name, Cancel and Delete buttons
- Delete button: disabled + spinner text when `deleting`; shows inline error when `deleteError` is set
- Escape key: `useEffect` with `onKeyDown` handler when dialog is open
- Focus trap: `useRef` on dialog; on open, focus Cancel button

**Patterns to follow:** `src/components/DirectoryPicker.tsx` — backdrop (`position: fixed; inset: 0; rgba(0,0,0,0.7)`), centered box, `onClick` backdrop closes, `setLaunching(true)` pattern for async button state

**Test scenarios:**
- Happy path: Click Delete → dialog appears with profile name → click Cancel → dialog closes, profile not deleted
- Happy path: Click Delete → dialog open → click Delete button → async delete completes successfully → dialog closes and profile list no longer contains the deleted profile
- Edge case: `deleting=true` → both buttons disabled, Delete button shows spinner
- Error path: Delete fails → dialog stays open, inline error shown, retry possible
- Keyboard: Escape key closes dialog without deleting
- Keyboard: Backdrop click closes dialog without deleting
- Accessibility: Cancel button is focused on dialog open

**Verification:** Dialog appears with correct profile name; keyboard (Escape, backdrop click) cancels; loading spinner during deletion; error shown on failure; profile deleted on confirm.

---

- [ ] **Unit 3: Official profiles read-only UI**

**Goal:** Profiles created from the "Claude Official" provider display all fields as read-only with no Delete or Duplicate buttons.

**Requirements:** R5, R6, R6a–R6c, R7, R8

**Dependencies:** Unit 1 (schema must exist before UI can use `provider_id`). Implement Unit 1 before Unit 3.

**Files:**
- Modify: `src/components/ProfileEditor.tsx` — add `official: boolean` prop, conditional rendering for fields and buttons
- Modify: `src/App.tsx` — pass `official={profile.provider_id === 'anthropic'}` to `ProfileEditor`; modify `handleDuplicateProfile` to set `provider_id: null` so duplicates of official profiles are custom

**Approach:**
- In `ProfileEditor`, add `official: boolean` prop
- `official = profile.provider_id === 'anthropic'`
- Fields: pass `readOnly={official}` to `Field` component — `Field` already supports `readOnly`
- Update `Field` component: `border: official ? 'none' : '1px solid #2A2A2A'` so read-only fields have no visible border (R6: no visible input borders)
- R6c: `official` → hide Save button entirely. **Rationale:** official profiles are read-only with no `onChange` handlers — the draft state can never diverge from the saved profile, so a Save button is meaningless and would give users false affordance.
- R7: `official` → hide Delete and Duplicate buttons
- In `App.tsx::handleDuplicateProfile`: set `provider_id: null` on the copy so duplicating an official profile produces a custom profile (not locked)
- Pass `official` prop computed from `profile.provider_id === 'anthropic'` in `App.tsx`

**Patterns to follow:** Existing `readOnly` styling in `ProfileEditor.tsx Field` component; conditional button rendering pattern in the same file

**Test scenarios:**
- Happy path: Select official profile → all fields show as read-only (no border, muted color), no Delete/Duplicate buttons visible, no Save button
- Happy path: Select custom profile → all fields editable, Delete/Duplicate/Save buttons visible
- Edge case: Profile with `provider_id = "deepseek"` → treated as custom (not official)
- Edge case: Profile with `provider_id = null` (migration case) → custom, fully editable
- Happy path: Duplicate official profile → new profile has `provider_id = null` and is editable (not locked)
- Happy path: Duplicate custom profile → new profile has `provider_id = null` (same as source, which was already null)

**Verification:** Official profile fields are visually distinct (no border, muted), action buttons absent. Custom profile behaves as before.

---

- [ ] **Unit 4: Tray menu native checked state**

**Goal:** Tray menu uses Tauri's `CheckMenuItemBuilder` with `.checked(bool)` instead of `✓` text prefixes for active profile and active locale.

**Requirements:** R9, R9a–R9c, R10, R11

**Dependencies:** None (tray.rs is independent of schema)

**Files:**
- Modify: `src-tauri/src/tray.rs` — replace `MenuItemBuilder` with `CheckMenuItemBuilder` for profile and language items

**Approach:**
- Import `CheckMenuItemBuilder` from `tauri::menu`
- In `build_tray_menu`:
  - Profile items: replace `MenuItemBuilder::with_id(profile.id.clone(), label)` with `CheckMenuItemBuilder::with_id(profile.id.clone(), profile.name.clone()).checked(is_active).build(app)?`
  - Language items: replace `MenuItemBuilder::with_id(ID_LANG_EN, lang_en_label)` with `CheckMenuItemBuilder::with_id(ID_LANG_EN, "English").checked(lang_en_checked).build(app)?` (and same for ZH)
  - Remove `✓` text prefix from active items; non-checked items show plain name
  - Empty/loading states: R9a/R9b — these are already handled by the existing `for profile in profiles` loop; if profiles is empty the loop produces no items; add a disabled "No profiles" `MenuItemBuilder` when `store.profiles.is_empty()`
- Keep Quit item as regular `MenuItemBuilder` (Quit is not a checkable item)
- Keep Launch Claude and Settings as regular `MenuItemBuilder`

**Patterns to follow:** Existing `menu_builder.item(&item)` chain in `build_tray_menu`; async spawn pattern in `handle_menu_event`

**Test scenarios:**
- Happy path: With profiles loaded, active profile shows native checkmark; non-active profiles show no checkmark
- Happy path: Language selection shows native checkmark on active locale
- Empty state: With zero profiles, menu shows "No profiles" disabled item before separator
- R11: Only one profile and one language can be checked simultaneously (enforced by OS for checkable items)

**Verification:** Tray menu opens on left-click; active profile has native OS checkmark; no `✓` text prefix visible.

---

- [ ] **Unit 5: Window close exits app**

**Goal:** Closing the settings window terminates the app process rather than hiding to tray.

**Requirements:** R12, R12a, R13

**Dependencies:** None (independent Rust backend work)

**Files:**
- Modify: `src-tauri/src/window.rs` — change close behavior
- Modify: `src-tauri/src/lib.rs` — add `on_window_close` handler if needed

**Approach:**
- The current `toggle_settings_window` in `window.rs` uses `window.hide()` for the hide case. This function is called on tray icon left-click (toggle) and from the Settings menu item — it is unchanged.
- The window-close event (when user clicks X) needs its own handler in `lib.rs` setup.
- In `lib.rs` `setup()`, use `Window::on_close_requested()` (or equivalent Tauri 2.x API) for the main window label. On close, call `app.exit(0)` instead of the default hide behavior.
- If the chosen Tauri API differs from `Window::on_close_requested()`, adjust accordingly — the goal is unchanged: close event → `app.exit(0)`.
- R12a (toast when closing before tray is registered): **Out of scope for this plan.** If the tray is set up before the window is first shown (as it is in the current `setup()` order: `setup_tray` then `show_settings_window`), this scenario cannot occur. If a future change reorders initialization, R12a can be addressed separately.
- The Quit tray item (R13) already calls `app.exit(0)` — no change needed there.

**Patterns to follow:** Existing `app.on_menu_event()` registration pattern in `lib.rs`; similar event registration pattern

**Test scenarios:**
- Happy path: Close the settings window → app process terminates
- Happy path: Click "Quit" in tray menu → app exits (existing behavior)
- R12a N/A: Tray is registered before window is shown (`setup_tray` → `show_settings_window` in `lib.rs`); no toast needed

**Verification:** Manually close the settings window — the process exits (no tray-only persistence). Clicking "Quit" from the tray also exits the process. Both paths call `app.exit(0)`, confirming R12 and R13.

---

## System-Wide Impact

- **Tray menu item types**: Switching profile/language items to `CheckMenuItemBuilder` changes the menu item type from `MenuItem` to `CheckMenuItem`. This is a type change within the builder only; the event handling (`handle_menu_event`) uses string IDs and is unaffected.
- **Config schema**: Adding `provider_id` to `ProfileConfig` changes the config.json format. Old configs without `provider_id` are handled by Rust deserialization (field absent → `None`).
- **Delete flow**: The confirmation dialog wraps the existing `onDelete` callback with async state management. `handleDeleteProfile` in `App.tsx` gains `async`/`boolean` return; `handleSaveProfiles` also returns `boolean` to propagate write failures. The `onDelete` prop on `ProfileEditor` changes from `(id: string) => void` to `(id: string) => Promise<boolean>`.
- **Window lifecycle**: Changing close-to-exit means the app no longer survives window close. Any code relying on window-hidden state (there is none currently — the tray always shows the window) is unaffected.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Adding `provider_id` breaks existing config round-trip tests | Add test for migration case (absent field → `None`) |
| `on_window_close` API in Tauri 2.x differs from assumed API | Verify during implementation; fallback to different close handler API if needed |
| Tray menu item type change causes runtime panic if `CheckMenuItem` doesn't implement some expected trait | Type-level only; builder `.build()` returns `Result<MenuItem, _>` — if wrong type, won't compile |

## Documentation / Operational Notes

- Config file format changes — no migration script needed (serde `None` for absent field)
- No changelog or migration guide needed for end users — this is pure UX improvement with safe backward compatibility
