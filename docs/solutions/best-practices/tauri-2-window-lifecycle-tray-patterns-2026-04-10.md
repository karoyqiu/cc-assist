---
module: cc-assist
date: "2026-04-10"
problem_type: best_practice
component: tooling
severity: medium
title: "Tauri 2.x Window Lifecycle and Tray Integration Patterns"
tags:
  - tauri-2
  - window-management
  - system-tray
  - run-event-loop
  - desktop-app
---

# Tauri 2.x Window Lifecycle and Tray Integration Patterns

## Context

When building a Tauri 2.x desktop application, the window lifecycle and tray icon interaction differ significantly from Tauri 1.x. The most common requirement — close the window but keep the process alive via a system tray — requires understanding the distinction between window close, app exit, and run event prevention. Additionally, Tauri 2.x changed the builder API so that `.run()` no longer accepts a callback directly; you must use `.build(context).run(callback)` instead. This catches many developers off guard because the Tauri 1.x patterns are well-documented but the 2.x equivalents are not always intuitive.

Separately, building tray menus with native checked states requires using `CheckMenuItemBuilder` rather than text-prefix hacks like `"✓ Item"`. And when adding nullable fields to persisted structs, `serde`'s `skip_serializing_if` maintains backward compatibility with existing config files.

## Guidance

### 1. Window Lifecycle: Close Destroys Window, Tray Quit Exits Process

Use two separate mechanisms:

- **`RunEvent::ExitRequested { api } => api.prevent_exit()`** keeps the process alive when the last window closes. The window is already destroyed at this point — no need to call `window.hide()` or `api.prevent_close()`.
- **`PredefinedMenuItem::quit(app, None)`** for the tray "Quit" item. This uses an internal exit path that bypasses `ExitRequested`, so it terminates the process even when `prevent_exit()` is active.

The builder pattern differs from Tauri 1.x:

```rust
// WRONG (Tauri 1.x style — .run() takes only Context in 2.x, no callback)
tauri::Builder::default()
    .setup(|app| { /* ... */ })
    .run(tauri::generate_context!());

// CORRECT (Tauri 2.x — build first, then run with callback)
tauri::Builder::default()
    .setup(|app| { /* ... */ })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
```

For the tray quit:

```rust
// WRONG — custom quit is blocked by prevent_exit()
let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
// app.exit(0) gets silently blocked by prevent_exit()!

// CORRECT — predefined quit bypasses ExitRequested
use tauri::menu::PredefinedMenuItem;
let quit_item = PredefinedMenuItem::quit(app, Some("Quit"))?;
menu_builder = menu_builder.item(&quit_item);
```

### 2. Native Tray Checkmarks

Use `CheckMenuItemBuilder` for items with an active/selected state. This renders native OS checkmarks instead of text-based emoji hacks.

```rust
// BEFORE — text prefix hack, non-native
let label = if is_active { format!("✓ {}", profile.name) } else { profile.name.clone() };
let item = MenuItemBuilder::with_id(profile.id.clone(), label).build(app)?;

// AFTER — native OS checkmark
let item = CheckMenuItemBuilder::with_id(profile.id.clone(), profile.name.clone())
    .checked(is_active)
    .build(app)?;
```

### 3. Backward-Compatible Nullable Fields with Serde

When adding a new optional field to a Rust struct that serializes to disk, use `#[serde(skip_serializing_if = "Option::is_none")]`. This prevents writing `null` values to existing config files and ensures old configs without the field deserialize cleanly into `None`.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileConfig {
    pub id: String,
    pub name: String,
    // ... existing fields ...
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
}
```

## Why This Matters

- **Window lifecycle is the single most common source of confusion** in Tauri desktop apps. The mental model — "close window" vs. "exit process" — maps to two completely different API surfaces. Getting this wrong results in either the entire app terminating on window close, or the tray Quit button doing nothing.
- **`PredefinedMenuItem::quit()` vs. custom `app.exit(0)`** is an undocumented behavioral difference. There is no compiler warning or runtime error when `app.exit(0)` is silently blocked by `prevent_exit()`. The app simply does not quit, with no signal about why.
- **`CheckMenuItemBuilder`** produces platform-native UI that users expect. Text-based checkmarks look out of place and break accessibility conventions.
- **`skip_serializing_if`** prevents config file churn and backward-incompatibility when rolling out new optional fields to existing installations.

## When to Apply

- Use the `build().run(callback)` + `prevent_exit()` + `PredefinedMenuItem::quit()` pattern whenever your app has a system tray and should survive window closure.
- Use `CheckMenuItemBuilder` for any tray menu item representing a selectable/active state (current profile, active mode, toggle setting).
- Use `#[serde(skip_serializing_if = "Option::is_none")]` whenever adding a new optional field to a persisted config struct.
- The `build().run()` form is always correct in Tauri 2.x, even without a run event callback. Pass `|_, _| {}` as a no-op callback.

## Examples

### Complete Window Lifecycle Pattern (Tauri 2.x)

```rust
// lib.rs
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            tray::setup_tray(app.handle())?;
            window::show_settings_window(app.handle());
            app.on_menu_event(|app, event| {
                tray::handle_menu_event(app, event.id().as_ref());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            // ... other commands
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
```

```rust
// tray.rs
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};

pub fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, Box<dyn std::error::Error>> {
    let mut menu_builder = MenuBuilder::new(app);

    // Profile items with native checkmarks
    for profile in &store.profiles {
        let is_active = profile.id == store.active_profile_id;
        let item = CheckMenuItemBuilder::with_id(profile.id.clone(), profile.name.clone())
            .checked(is_active)
            .build(app)?;
        menu_builder = menu_builder.item(&item);
    }

    menu_builder = menu_builder.separator();

    // Quit — bypasses ExitRequested even with prevent_exit()
    let quit_item = PredefinedMenuItem::quit(app, None)?;
    menu_builder = menu_builder.item(&quit_item);

    Ok(menu_builder.build()?)
}
```

### React Delete Confirmation with Async Error Propagation

```tsx
// Key pattern: capture ID at open time via ref, not state, to avoid stale closures
const deleteTargetId = useRef<string | null>(null);

// Open dialog captures the ID immediately
<button onClick={() => {
    deleteTargetId.current = draft.id;
    setShowDeleteConfirm(true);
}}>Delete</button>

// Confirm handler reads from ref, not from draft (which may have changed)
const handleConfirmDelete = async () => {
    const targetId = deleteTargetId.current;
    if (!targetId) return;
    setDeleting(true);
    const ok = await onDelete(targetId);
    setDeleting(false);
    if (ok) {
        setShowDeleteConfirm(false);
    } else {
        setDeleteError(t('profileEditor.deleteFailed'));
    }
};
```

## Related

- Implementation plan: `docs/plans/2026-04-09-001-feat-profile-ui-improvements-plan.md`
- Requirements brainstorm: `docs/brainstorms/2026-04-09-profile-ui-improvements-requirements.md`
