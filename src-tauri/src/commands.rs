use tauri::{AppHandle, Emitter, Manager, State};

use crate::config;
use crate::settings;
use crate::spawn;
use crate::state::AppState;
use crate::terminal;
use crate::tray;
use crate::types::{ProfileConfig, ProfilesStore, ProviderConfig};
use crate::window;

/// Get the full config store.
#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Result<ProfilesStore, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.clone())
}

/// Get the built-in provider list.
#[tauri::command]
pub fn get_providers() -> Vec<ProviderConfig> {
    config::built_in_providers()
}

/// Set the active profile by ID.
#[tauri::command]
pub fn set_active_profile(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Clone the full store before mutating, so we can rollback if save fails.
    let store_to_save = {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        if !store.profiles.iter().any(|p| p.id == id) {
            return Err(format!("Profile not found: {}", id));
        }
        store.active_profile_id = id.clone();
        (*store).clone()
    };
    // MutexGuard dropped — save.
    let app_data_dir = state.app_data_dir.lock().unwrap();
    if let Err(e) = config::save_config(&app_data_dir, &store_to_save) {
        // Rollback: restore the original active profile.
        log::error!("Failed to persist profile switch: {}", e);
        return Err(e.to_string());
    }
    Ok(())
}

/// Apply a profile to ~/.claude/settings.json and set it as the active profile.
/// This is the "Use" action — persistent, like cc-switch.
#[tauri::command]
pub fn use_profile(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // 1. Find profile, update active_profile_id, clone store
    let (profile, store_to_save) = {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        let profile = store
            .profiles
            .iter()
            .find(|p| p.id == id)
            .ok_or_else(|| format!("Profile not found: {}", id))?
            .clone();
        store.active_profile_id = id.clone();
        (profile, (*store).clone())
    };

    // 2. Write profile env vars to ~/.claude/settings.json
    settings::apply_profile_to_settings(&profile).map_err(|e| e.to_string())?;

    // 3. Persist config (active_profile_id changed)
    let app_data_dir = state.app_data_dir.lock().unwrap();
    config::save_config(&app_data_dir, &store_to_save).map_err(|e| e.to_string())?;

    // 4. Rebuild tray menu to sync checkmark
    tray::rebuild_menu(&app, &app_data_dir);

    Ok(())
}

/// Save the full profiles list (full replace).
#[tauri::command]
pub fn save_profiles(
    profiles: Vec<ProfileConfig>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Clone and modify, then persist — avoids mutating before confirming save.
    let store_to_save = {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;

        // Ensure active profile still exists
        if !store.active_profile_id.is_empty()
            && !profiles.iter().any(|p| p.id == store.active_profile_id)
        {
            if let Some(first) = profiles.first() {
                store.active_profile_id = first.id.clone();
            } else {
                store.active_profile_id = String::new();
            }
        }

        store.profiles = profiles;
        (*store).clone()
    };
    let app_data_dir = state.app_data_dir.lock().unwrap();
    config::save_config(&app_data_dir, &store_to_save).map_err(|e| e.to_string())?;
    Ok(())
}

/// Launch Claude in a directory with the given profile.
#[tauri::command]
pub fn launch_claude(
    directory: String,
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (profile, active_id) = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        let profile = store
            .profiles
            .iter()
            .find(|p| p.id == profile_id)
            .ok_or_else(|| format!("Profile not found: {}", profile_id))?
            .clone();
        (profile, store.active_profile_id.clone())
    };

    let dir = std::path::PathBuf::from(&directory);
    // Early return: only record directory if spawn succeeds.
    spawn::launch_claude_in_directory(&profile, &dir).map_err(|e| e.to_string())?;

    // Record recent directory — use &*store (not &mut store) to avoid
    // mutating in-memory state before persistence.
    {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        let entries = store
            .recent_directories
            .entry(active_id)
            .or_insert_with(Vec::new);
        entries.retain(|d| d != &directory);
        entries.insert(0, directory.clone());
        entries.truncate(10);
        let app_data_dir = state.app_data_dir.lock().unwrap();
        config::save_config(&app_data_dir, &store).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open native directory picker via rfd.
#[tauri::command]
pub fn pick_directory() -> Result<Option<String>, String> {
    let result = rfd::FileDialog::new()
        .set_title("Select directory to launch Claude")
        .pick_folder();
    Ok(result.map(|p| p.to_string_lossy().to_string()))
}

/// Set locale and emit event to frontend.
#[tauri::command]
pub fn set_locale(
    locale: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.locale = locale.clone();
    let app_data_dir = state.app_data_dir.lock().unwrap();
    config::save_config(&app_data_dir, &store).map_err(|e| e.to_string())?;
    drop(store);

    app.emit("locale-changed", locale)
        .map_err(|e| format!("Failed to emit locale-changed event: {}", e))?;
    Ok(())
}

/// Switch the UI locale and persist the change. Used internally by tray.rs
/// handle_menu_event — same deadlock-avoidance pattern as switch_active_profile.
pub fn switch_locale(
    locale: &str,
    state: &AppState,
) -> Result<(), String> {
    // Clone the full store while holding the lock, then drop the guard.
    let store_to_save = {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        if store.locale == locale {
            return Ok(()); // Nothing to do.
        }
        store.locale = locale.to_string();
        (*store).clone()
    };
    // MutexGuard dropped — save_config won't deadlock.
    let app_data_dir = state.app_data_dir.lock().unwrap();
    config::save_config(&app_data_dir, &store_to_save).map_err(|e| e.to_string())?;
    Ok(())
}

/// Check if claude is on PATH.
#[tauri::command]
pub fn check_claude_on_path() -> bool {
    spawn::check_claude_on_path()
}

/// Simple ping test.
#[tauri::command]
pub fn ping() -> String {
    log::info!("ping called!");
    "pong".to_string()
}

/// Toggle the settings window (show if hidden, hide if shown).
#[tauri::command]
pub fn toggle_settings_window(app: AppHandle) {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        window::toggle_settings_window(&app_clone);
    });
}

/// Show the settings window.
#[tauri::command]
pub fn show_settings_window_cmd(app: AppHandle) {
    window::show_settings_window(&app);
}

/// Rebuild the tray menu with translated strings from the frontend i18n system.
#[tauri::command]
pub fn rebuild_tray_menu(
    app: AppHandle,
    settings_label: String,
    lang_en_label: String,
    lang_zh_label: String,
    quit_label: String,
) -> Result<(), String> {
    let app_data_dir = app.state::<AppState>().app_data_dir.lock().unwrap().clone();
    tray::rebuild_menu_with_strings(
        &app,
        &app_data_dir,
        &settings_label,
        &lang_en_label,
        &lang_zh_label,
        &quit_label,
    );
    Ok(())
}

/// Open the terminal window and auto-create a session with the active profile
/// and most recent directory.
#[tauri::command]
pub fn launch_terminal(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<terminal::CreateSessionResult, String> {
    log::info!("launch_terminal called");
    let (profile, directory) = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        log::info!("Store lock acquired, profiles: {}", store.profiles.len());
        let profile = store
            .profiles
            .iter()
            .find(|p| p.id == store.active_profile_id)
            .ok_or_else(|| "No active profile".to_string())?
            .clone();
        let recent = store
            .recent_directories
            .get(&store.active_profile_id)
            .and_then(|dirs| dirs.first().cloned())
            .unwrap_or_else(|| std::env::current_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default());
        log::info!("Profile: {}, recent dir: {}", profile.name, recent);
        (profile, recent)
    };

    // Open the terminal window
    log::info!("Opening terminal window...");
    window::show_terminal_window(&app);
    log::info!("Terminal window shown");

    // Create a session in that directory with that profile
    let dir = if directory.is_empty() {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
    } else {
        std::path::PathBuf::from(&directory)
    };
    log::info!("Creating session in dir: {}", dir.display());
    let result = terminal::create_session(&profile, &dir, app);
    log::info!("create_session result: {:?}", result);
    result
}

/// Create a new terminal session.
#[tauri::command]
pub fn terminal_create_session(
    profile_id: String,
    directory: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<terminal::CreateSessionResult, String> {
    log::info!(
        "terminal_create_session called: profile_id={}, directory='{}'",
        profile_id,
        directory
    );
    let profile = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        store
            .profiles
            .iter()
            .find(|p| p.id == profile_id)
            .ok_or_else(|| format!("Profile not found: {}", profile_id))?
            .clone()
    };
    let dir = if directory.is_empty() {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
    } else {
        std::path::PathBuf::from(&directory)
    };
    log::info!("Creating session in dir: {}", dir.display());
    terminal::create_session(&profile, &dir, app)
}

/// Write keystrokes to a terminal session.
#[tauri::command]
pub fn terminal_write(
    session_id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    terminal::write_to_session(&session_id, &data, &state)
}

/// Resize a terminal session.
#[tauri::command]
pub fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    terminal::resize_session(&session_id, cols, rows, &state)
}

/// Close a terminal session.
#[tauri::command]
pub fn terminal_close_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    terminal::close_session(&session_id, &state)
}
