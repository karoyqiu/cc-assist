---
date: 2026-04-09
topic: profile-ui-improvements
---

# Profile List & Tray UI Improvements

## Problem Frame

The profile management UI and system tray have four rough edges: delete happens without confirmation, profiles from the Claude Official provider are editable despite being provider-sourced, the tray menu uses text-prefix tricks instead of native checked state, and the app window-close/exit relationship is unclear.

## Requirements

**Delete Confirmation**
- R1. Clicking the Delete button in the profile editor shows a confirmation dialog.
- R2. The dialog displays the profile name being deleted.
- R3. The dialog offers "Cancel" and "Delete" actions.
- R4. Canceling closes the dialog with no change; confirming proceeds to delete the profile and closes the dialog.
- R4a. During deletion the Confirm button shows a loading spinner and both buttons are disabled.
- R4b. If deletion fails the dialog remains open with an inline error message; the user can Cancel or retry.
- R4c. On success the dialog closes and the profile list refreshes.
- R4d. The dialog traps focus; Escape closes without deleting (same as Cancel).
- R4e. The Cancel button is focused by default; the Delete button is only focused if the user Tabs to it.
- R4f. A semi-transparent backdrop covers the editor behind the dialog.
- R4g. Clicking the backdrop behaves identically to clicking Cancel.
- R4h. On open, focus is trapped inside the dialog and placed on the Cancel button.

**Official Profiles Are Read-Only**
- R5. A profile is considered "official" if it was created from the "Claude Official" provider (provider.id == "anthropic") — tracked by a new optional `provider_id` field on `ProfileConfig`.
- R6. Official profiles display all fields as read-only in the profile editor (no `onChange` handlers, cursor: default, no visible input borders).
- R6a. Read-only fields use a muted background and inherit text color, visually distinguished from editable fields.
- R6b. Fields are focusable for accessibility (tabIndex preserved) but show no focus ring.
- R6c. The Save button is hidden entirely for official profiles.
- R7. Official profiles show no Delete or Duplicate action buttons.
- R8. Non-official (custom) profiles behave unchanged.

**Tray Menu Native Checked State**
- R9. Active profile and active locale use Tauri's `MenuItemBuilder::checked()` property instead of `✓` text prefixes.
- R9a. If profiles are loading, the menu shows a disabled "Loading profiles..." item.
- R9b. If no profiles exist, show a disabled "No profiles" item.
- R9c. The "Quit" item remains accessible in both states.
- R10. Non-checked items have no prefix; checked items show a native checkmark via the OS menu widget.
- R11. Profile and language checked states are mutually exclusive within their groups (one checked at a time).

**Window Close Exits App**
- R12. Closing the settings window causes the app to exit — the tray icon does not keep the app alive.
- R12a. If no tray icon exists (first launch before tray is registered), closing the window shows a toast: "The app will keep running in the system tray. Exit from the tray menu to fully quit."
- R13. The tray menu Quit item remains available; explicit Quit always calls `app.exit(0)`.

## Success Criteria
- Profile deletion always shows a confirmation with the profile name before removal.
- Profiles created from "Claude Official" provider cannot be edited or deleted, and have no Duplicate action.
- The tray menu uses native OS checked indicators for the active profile and active locale, with exactly one selection per group.
- Closing the app window terminates the process; no tray-only persistence.

## Scope Boundaries
- Custom profiles (created via "Custom Provider" or from non-anthropic providers) are fully editable and deletable — no change.
- The "Quit" tray menu item is kept for explicit exit; it is not removed.

## Key Decisions
- `provider_id` field added to `ProfileConfig` (TypeScript and Rust) to track which provider a profile was created from, enabling official profile detection without brittle base_url matching.
- Confirmation dialog is a simple in-component modal (no external dialog library) — consistent with existing in-app modal patterns.
- Tray menu rebuilds on profile switch or locale change; the checked property is set per `MenuItemBuilder::checked()` on each build.

## Dependencies / Assumptions
- R5 requires a schema migration: existing `ProfileConfig` records with no `provider_id` field will be treated as non-official (custom), which is safe because they are user-created.
- R12 requires investigating whether Tauri's window close handler currently hides or exits — the implementation may need to change from `window.hide()` to `app.exit(0)` on close event, or removal of a `preventClose` flag if one exists.

## Outstanding Questions

### Resolve Before Planning
- [Affects R9][Needs research] `MenuItemBuilder::checked()` does not exist in Tauri 2.x — the correct API is `CheckMenuItemBuilder::with_id()` with `.checked(bool)`. Verify this is available on all target platforms and does not require a full menu rebuild to toggle checked state.

### Deferred to Planning
- [Affects R5][Technical] Profile duplication: duplicating an official profile produces an editable custom profile with `provider_id` cleared (official lock not inherited). This is implied by R7/R8 but should be made explicit.
- [Affects R12][Implementation] Verify window close behavior in `src-tauri/src/window.rs` — current implementation uses `window.hide()` on close. The close handler must be changed to call `app.exit(0)` to implement R12.
