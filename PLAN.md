# Implementation Plan: Claude Profile Switcher (cc-assist)

**Branch:** develop
**Design doc:** `~/.gstack/projects/cc-assist/roy-develop-design-20260409-143000.md` (APPROVED)
**Status:** Implemented on `develop` (2026-04-11) — see commit history

---

## Overview

Build a tray-resident Tauri 2.0 desktop app that switches Claude Code profiles by merging env vars into `~/.claude/settings.json`. All core logic in Rust std. React is thin UI.

---

## Step 0: Pre-implementation Gates

1. **Inspect `~/.claude/settings.json`** — run `claude` once, read the file. Confirm env var names.
2. **Verify hot-switching** — with a live `claude` session open, edit settings.json, run `claude` again. Confirm it reads new values.
3. **Verify Tauri 2.0 tray flat menu API** on Windows.

---

## Step 1: Rust Core + Tauri Scaffold

### 1.1 Cargo deps (`src-tauri/Cargo.toml`)

Add:
- `rfd` — native file/directory picker (pure Rust, no plugin)
- `tauri-plugin-single-instance` — singleton enforcement
- `uuid` — profile ID generation
- `dirs` — app data dir (`%APPDATA%/cc-assist/config.json`)
- `log` + `simplelog` or `tracing` — basic logging

### 1.2 ProfileConfig + ProfilesStore types (`src-tauri/src/types.rs`)

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct ModelConfig {
    pub main: Option<String>,       // → ANTHROPIC_MODEL
    pub haiku: Option<String>,      // → ANTHROPIC_DEFAULT_HAIKU_MODEL
    pub sonnet: Option<String>,     // → ANTHROPIC_DEFAULT_SONNET_MODEL
    pub opus: Option<String>,       // → ANTHROPIC_DEFAULT_OPUS_MODEL
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProfileConfig {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub iconColor: String,
    pub base_url: String,           // → ANTHROPIC_BASE_URL
    pub api_key: String,            // → ANTHROPIC_AUTH_TOKEN
    pub models: ModelConfig,
    pub is_built_in: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct RecentDirectories {
    // Record<profileId, Vec<String>> — last 10 dirs per profile
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProfilesStore {
    pub active_profile_id: String,
    pub profiles: Vec<ProfileConfig>,
    pub recent_directories: RecentDirectories,
    pub locale: String,             // "en" | "zh"
}
```

### 1.3 Built-in presets

```rust
fn built_in_presets() -> Vec<ProfileConfig> {
    vec![
        ProfileConfig {
            id: "anthropic-official".into(),
            name: "Claude Official".into(),
            icon: "anthropic".into(),
            icon_color: "#D4915D".into(),
            base_url: "https://api.anthropic.com".into(),
            api_key: "".into(),
            models: ModelConfig { main: None, haiku: None, sonnet: None, opus: None },
            is_built_in: true,
        },
        // ... z.ai Intl, z.ai CN, MiniMax CN, MiniMax Intl, Kimi, DeepSeek
    ]
}
```

### 1.4 App state (`src-tauri/src/state.rs`)

```rust
use std::sync::Mutex;

pub struct AppState {
    pub store: Mutex<ProfilesStore>,
    pub app_data_dir: PathBuf,
}
```

### 1.5 Config file I/O (`src-tauri/src/config.rs`)

- `load_config(app_data_dir) -> ProfilesStore` — read `%APPDATA%/cc-assist/config.json`, create with defaults if absent
- `save_config(app_data_dir, &ProfilesStore) -> Result<()>` — atomic write: temp file + rename
- Config file format: JSON matching ProfilesStore schema

### 1.6 Settings.json merge (`src-tauri/src/settings.rs`)

- `read_settings_json() -> Result<Value>` — read `~/.claude/settings.json`
- `build_env_map(profile: &ProfileConfig) -> HashMap<String, String>` — produce ANTHROPIC_* keys from profile fields; only non-empty fields included:
  - `base_url` → `ANTHROPIC_BASE_URL`
  - `api_key` → `ANTHROPIC_AUTH_TOKEN`
  - `models.main` → `ANTHROPIC_MODEL`
  - `models.haiku` → `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `models.sonnet` → `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `models.opus` → `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `merge_profile_into_settings(profile: &ProfileConfig, settings: &mut Value)` — deep-merge only non-empty model fields into `settings["env"]`, preserve all other fields
- `write_settings_atomically(settings: &Value) -> Result<()>` — temp file + rename, rollback on failure
- `restore_settings_backup() -> Result<()>` — restore from settings.json.bak

### 1.7 Tauri commands (`src-tauri/src/commands.rs`)

| Command | Signature | Description |
|---------|-----------||-------------|
| `get_config` | `() → ProfilesStore` | Return full config |
| `set_active_profile` | `(id: String) → Result<()>` | Update active, persist |
| `save_profiles` | `(profiles: Vec<ProfileConfig>) → Result<()>` | Full replace, persist |
| `launch_claude` | `(directory: String) → Result<(), String>` | Pre-flight check, merge settings, spawn `cmd /c start "" claude` |
| `pick_directory` | `() → Result<Option<String>>` | Open native dir picker via rfd |
| `set_locale` | `(locale: String) → Result<()>` | Update locale, emit `locale-changed` event |
| `check_claude_on_path` | `() → bool` | `where claude` / `which claude` |

### 1.8 Process spawning + atomic launch (`src-tauri/src/spawn.rs`)

```rust
pub fn launch_claude_in_directory(dir: &Path) -> Result<()> {
    // 1. Backup settings.json → settings.json.bak
    // 2. Merge profile env into settings.json (atomic: temp+rename)
    // 3. Spawn: cmd /c start "" claude (detached, in directory)
    // 4. On spawn failure: restore settings.json from .bak, return error
    //    On success: delete .bak
    // Use std::process::Command with .current_dir(dir)
    // Use std::fs for backup/restore
}
```

### 1.9 Tray + menu setup (`src-tauri/src/tray.rs`)

- `setup_tray(app: &AppHandle) -> Result<()>`
- Tray icon with tooltip "cc-assist — [Active Profile Name]"
- Left-click: toggle settings window via `TrayIconEvent::Click` handler
- Right-click menu (flat, no submenus):
  - [Profile name] items with checkmark on active
  - Separator
  - Launch Claude
  - Separator
  - Settings
  - English / Chinese (radio)
  - Quit

```rust
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{MenuBuilder, MenuItemBuilder};

// Build flat menu (no submenus) with MenuBuilder
let menu = MenuBuilder::new(app)
    .item(&profile_items...)  // dynamic per active profile
    .separator()
    .item(&launch_item)
    .separator()
    .item(&settings_item)
    .item(&lang_en_item)
    .item(&lang_zh_item)
    .separator()
    .item(&quit_item)
    .build()?;

let tray = TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .menu(&menu)
    .menu_on_left_click(false)  // right-click shows menu
    .tooltip("cc-assist — active_profile_name")
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            toggle_settings_window(tray.app_handle());
        }
    })
    .build(app)?;
```

### 1.10 Settings window (`src-tauri/src/window.rs`)

- `show_settings_window(app: &AppHandle)` — create or show the settings window
- Window: 700x500, resizable, centered, close button closes window normally
- `on_window_close` — does NOT hide window; window is destroyed. App stays alive via `prevent_exit()` in tray setup.

```rust
// In tray setup, keep app alive after window close:
app.listen_once::<RunEvent>(|event| {
    if let RunEvent::ExitRequested { api, .. } = event {
        api.prevent_exit();  // tray icon keeps app alive
    }
});
```

### 1.11 Register in `lib.rs`

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_settings_window(app);
        }))
        .manage(AppState { ... })
        .setup(|app| {
            setup_tray(app.handle())?;
            show_settings_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config, set_active_profile, save_profiles,
            launch_claude, pick_directory, set_locale, check_claude_on_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 1.12 Tauri capabilities (`src-tauri/capabilities/default.json`)

Add:
- `event:default` — for `locale-changed` event
- `dialog:default` — rfd uses its own permission model (not Tauri dialog plugin)

---

## Step 2: React Frontend (Thin UI)

### 2.1 Install i18n deps

```bash
pnpm add react-i18next i18next
```

### 2.2 Locale files

- `src/locales/en.json` — English strings
- `src/locales/zh.json` — Chinese (Simplified) strings
- Key sections: `tray`, `settings`, `profileEditor`, `directoryPicker`, `errors`

### 2.3 i18n setup (`src/lib/i18n.ts`)

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import zh from '../locales/zh.json';
// On locale-changed Tauri event: i18n.changeLanguage(locale)
```

### 2.4 Profile list + editor (`src/components/ProfileList.tsx` + `ProfileEditor.tsx`)

- Left panel: list of profiles with avatar (icon + color circle), name, active indicator
- Right panel: editor for selected profile
  - Built-in: read-only baseUrl, editable apiKey + models
  - Custom: full edit (name, baseUrl, apiKey, models)
- Add Profile / Delete / Duplicate buttons
- Launch button (opens directory picker)

### 2.5 Tray tooltip + state sync

- On mount: `invoke('get_config')` to load state
- Subscribe to `locale-changed` event to re-render

### 2.6 Directory picker modal (`src/components/DirectoryPicker.tsx`)

- Native picker via `invoke('pick_directory')`
- Recent directories list (from config)
- Confirm / Cancel

---

## Step 3: App Data & Logging

- App data: `%APPDATA%/cc-assist/config.json`
- Logging: `log` crate writing to `%APPDATA%/cc-assist/app.log`
- On panic: log panic, keep app alive (don't crash to tray)

---

## Step 4: Icon Setup

- Use default Tauri icons initially (in `src-tauri/icons/`)
- App icon shows in system tray

---

## File Map

```
src-tauri/src/
  lib.rs          — Builder setup, generate_handler!
  main.rs         — entry point (unchanged)
  types.rs        — ProfileConfig, ProfilesStore, ModelConfig
  state.rs        — AppState struct
  config.rs       — load/save config.json (atomic)
  settings.rs     — read/merge/write ~/.claude/settings.json (atomic)
  commands.rs     — all #[tauri::command] fns
  spawn.rs        — launch_claude_in_directory
  tray.rs         — setup_tray, tray menu building
  window.rs       — show/hide settings window

src/
  lib/i18n.ts     — i18next setup
  locales/
    en.json
    zh.json
  components/
    ProfileList.tsx
    ProfileEditor.tsx
    DirectoryPicker.tsx
  App.tsx         — main layout, state management
```

---

## NOT in Scope

- Mobile (Tauri mobile targets) — Windows desktop only
- Auto-update / hot-reload of config
- Profile import/export UI
- Multiple simultaneous Claude launches tracked by app
- Custom icons per profile (only built-in icon set)

---

## What Already Exists

- Tauri 2.0 scaffold with React 19 + Tailwind 4 + shadcn/ui
- `cc_assist_lib` crate name already set up
- `App.css`, `App.tsx` as entry points

---

## Distribution

- `cargo tauri build` → `.exe` in `src-tauri/target/release/`
- GitHub Releases for distribution

---

## Failure Modes

| Failure | What happens | User-visible? | Covered? |
|---------|-------------|---------------|----------|
| `claude` not on PATH | `check_claude_on_path` returns false, launch returns error | Yes — "Claude CLI not found" | Yes |
| settings.json missing | `read_settings_json` returns Err, launch aborts | Yes — "Claude not configured yet" | Yes |
| settings.json corrupt JSON | `read_settings_json` returns Err, launch aborts | Yes — error toast | GAP — test needed |
| Disk full on settings.json write | `write_settings_atomically` fails, original unchanged, launch aborts | Yes — "Failed to write settings" | GAP — test needed |
| Spawn succeeds but Claude exits immediately | Settings merged, recent dir recorded, but no live session | No — silent failure | GAP |
| Spawn failure + backup restore fails | settings.json may be left in merged state | Yes — "Launch failed, settings may be inconsistent" | GAP |
| Race: two rapid profile switches | Last-write-wins for both store and settings.json | App behavior: last-write-wins | No — single-instance prevents |
| App data dir missing on first run | `save_config` creates dir, succeeds silently | No silent failure | GAP — test needed |

---

## Implementation Order

Sequential. Rust backend (types → config/settings → commands → tray/window) must be complete before React `invoke()` calls can be written.

```
Step 1: Rust types + state + config I/O + settings merge + commands
Step 2: Rust tray + window setup (depends on Step 1)
Step 3: React components + i18n (depends on Step 1 for invoke signatures)
Step 4: Tests (can write after Step 1)
```

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 3 issues found, 3 resolved. Tray event, prevent_exit, backup/restore added. Separate env map builder added. 8 Rust + 5 React test gaps identified. |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| Adversarial | `review` | Always-on | 0 | — | — |
| Outside Voice | `codex-plan-review` | Independent 2nd opinion | 0 | — | Outside voice unavailable (subagent returned empty) |

**UNRESOLVED:** None.
**VERDICT:** ENG REVIEW CLEARED — ready to implement.
