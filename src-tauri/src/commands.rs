use tauri::{AppHandle, Emitter, State};

use crate::config;
use crate::spawn;
use crate::state::AppState;
use crate::types::{ProfileConfig, ProfilesStore};
use crate::window;

/// Get the full config store.
#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Result<ProfilesStore, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.clone())
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
    if let Err(e) = config::save_config(&state.app_data_dir, &store_to_save) {
        // Rollback: restore the original active profile.
        log::error!("Failed to persist profile switch: {}", e);
        return Err(e.to_string());
    }
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
    config::save_config(&state.app_data_dir, &store_to_save).map_err(|e| e.to_string())?;
    Ok(())
}

/// Launch Claude in a directory with the active profile.
#[tauri::command]
pub fn launch_claude(
    directory: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (profile, active_id) = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        let profile = store
            .profiles
            .iter()
            .find(|p| p.id == store.active_profile_id)
            .ok_or_else(|| "No active profile".to_string())?
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
        config::save_config(&state.app_data_dir, &store).map_err(|e| e.to_string())?;
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
    config::save_config(&state.app_data_dir, &store).map_err(|e| e.to_string())?;
    drop(store);

    app.emit("locale-changed", locale)
        .map_err(|e| format!("Failed to emit locale-changed event: {}", e))?;
    Ok(())
}

/// Switch the active profile by ID and persist the change. Used internally by
/// tray.rs handle_menu_event — avoids deadlock by cloning the store before
/// dropping the lock, so save_config can acquire its own lock safely.
pub fn switch_active_profile(
    id: &str,
    state: &AppState,
) -> Result<(), String> {
    // Clone the full store while holding the lock so save_config (which
    // internally acquires the same lock) won't deadlock.
    let store_to_save = {
        let mut store = state.store.lock().map_err(|e| e.to_string())?;
        if !store.profiles.iter().any(|p| p.id == id) {
            return Err(format!("Profile not found: {}", id));
        }
        store.active_profile_id = id.to_string();
        (*store).clone()
    };
    // MutexGuard dropped here — save_config's internal lock acquisition is now safe.
    config::save_config(&state.app_data_dir, &store_to_save).map_err(|e| e.to_string())?;
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
    config::save_config(&state.app_data_dir, &store_to_save).map_err(|e| e.to_string())?;
    Ok(())
}

/// Check if claude is on PATH.
#[tauri::command]
pub fn check_claude_on_path() -> bool {
    spawn::check_claude_on_path()
}

/// Toggle the settings window (show if hidden, hide if shown).
#[tauri::command]
pub fn toggle_settings_window(app: AppHandle) {
    window::toggle_settings_window(&app);
}

/// Show the settings window.
#[tauri::command]
pub fn show_settings_window_cmd(app: AppHandle) {
    window::show_settings_window(&app);
}
