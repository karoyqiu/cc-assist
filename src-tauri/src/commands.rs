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
    let mut store = state.store.lock().map_err(|e| e.to_string())?;

    // Verify profile exists
    if !store.profiles.iter().any(|p| p.id == id) {
        return Err(format!("Profile not found: {}", id));
    }

    store.active_profile_id = id;
    config::save_config(&state.app_data_dir, &store).map_err(|e| e.to_string())?;
    Ok(())
}

/// Save the full profiles list (full replace).
#[tauri::command]
pub fn save_profiles(
    profiles: Vec<ProfileConfig>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;

    // Ensure active profile still exists
    if !store.active_profile_id.is_empty()
        && !profiles.iter().any(|p| p.id == store.active_profile_id)
    {
        // Active profile was deleted — switch to first remaining
        if let Some(first) = profiles.first() {
            store.active_profile_id = first.id.clone();
        } else {
            store.active_profile_id = String::new();
        }
    }

    store.profiles = profiles;
    config::save_config(&state.app_data_dir, &store).map_err(|e| e.to_string())?;
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
    spawn::launch_claude_in_directory(&profile, &dir).map_err(|e| e.to_string())?;

    // Record recent directory
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    let entries = store
        .recent_directories
        .entry(active_id)
        .or_insert_with(Vec::new);

    // Remove if already exists (will re-add at front)
    entries.retain(|d| d != &directory);
    entries.insert(0, directory);
    // Keep only last 10
    entries.truncate(10);

    config::save_config(&state.app_data_dir, &store).map_err(|e| e.to_string())?;
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
