use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::commands;
use crate::settings;
use crate::state::AppState;
use crate::window;

// Menu item ID constants — cross-referenced across build_tray_menu and handle_menu_event.
const ID_SETTINGS: &str = "settings";
const ID_LANG_EN: &str = "lang-en";
const ID_LANG_ZH: &str = "lang-zh";

/// Build the tray icon and menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.state::<AppState>().app_data_dir.lock().unwrap().clone();

    // Get active profile name for initial tooltip.
    let tooltip = {
        let state = app.state::<AppState>();
        let store = (*state.store.lock().unwrap()).clone();
        let name = store
            .profiles
            .iter()
            .find(|p| p.id == store.active_profile_id)
            .map(|p| p.name.as_str())
            .unwrap_or("cc-assist");
        format!("cc-assist — {}", name)
    };

    let menu = build_tray_menu(app, &app_data_dir)?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(tooltip)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle_settings_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Build the tray menu (used on init and after profile/locale changes).
pub fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    _app_data_dir: &std::path::Path,
) -> Result<tauri::menu::Menu<R>, Box<dyn std::error::Error>> {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return Err("AppState not initialized".into()),
    };
    let store = (*state.store.lock().unwrap()).clone();

    let mut menu_builder = MenuBuilder::new(app);

    // Profile items
    for profile in &store.profiles {
        let is_active = profile.id == store.active_profile_id;
        let item = CheckMenuItemBuilder::with_id(profile.id.clone(), profile.name.clone())
            .checked(is_active)
            .build(app)?;

        menu_builder = menu_builder.item(&item);
    }

    menu_builder = menu_builder.separator();

    // Settings
    let settings_item = MenuItemBuilder::with_id(ID_SETTINGS, "Settings")
        .build(app)?;
    menu_builder = menu_builder.item(&settings_item);

    menu_builder = menu_builder.separator();

    // Language: English
    let lang_en_checked = store.locale == "en";
    let lang_en_item = CheckMenuItemBuilder::with_id(ID_LANG_EN, "English")
        .checked(lang_en_checked)
        .build(app)?;
    menu_builder = menu_builder.item(&lang_en_item);

    // Language: Chinese
    let lang_zh_checked = store.locale == "zh";
    let lang_zh_item = CheckMenuItemBuilder::with_id(ID_LANG_ZH, "中文")
        .checked(lang_zh_checked)
        .build(app)?;
    menu_builder = menu_builder.item(&lang_zh_item);

    menu_builder = menu_builder.separator();

    // Quit — uses Tauri's built-in quit to properly exit even with ExitRequested prevention
    let quit_item = PredefinedMenuItem::quit(app, None)?;
    menu_builder = menu_builder.item(&quit_item);

    Ok(menu_builder.build()?)
}

/// Build the tray menu with translated strings (used after locale changes).
pub fn build_tray_menu_with_strings<R: Runtime>(
    app: &AppHandle<R>,
    settings_label: &str,
    lang_en_label: &str,
    lang_zh_label: &str,
    quit_label: &str,
) -> Result<tauri::menu::Menu<R>, Box<dyn std::error::Error>> {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return Err("AppState not initialized".into()),
    };
    let store = (*state.store.lock().unwrap()).clone();

    let mut menu_builder = MenuBuilder::new(app);

    // Profile items
    for profile in &store.profiles {
        let is_active = profile.id == store.active_profile_id;
        let item = CheckMenuItemBuilder::with_id(profile.id.clone(), profile.name.clone())
            .checked(is_active)
            .build(app)?;

        menu_builder = menu_builder.item(&item);
    }

    menu_builder = menu_builder.separator();

    // Settings
    let settings_item = MenuItemBuilder::with_id(ID_SETTINGS, settings_label)
        .build(app)?;
    menu_builder = menu_builder.item(&settings_item);

    menu_builder = menu_builder.separator();

    // Language: English
    let lang_en_checked = store.locale == "en";
    let lang_en_item = CheckMenuItemBuilder::with_id(ID_LANG_EN, lang_en_label)
        .checked(lang_en_checked)
        .build(app)?;
    menu_builder = menu_builder.item(&lang_en_item);

    // Language: Chinese
    let lang_zh_checked = store.locale == "zh";
    let lang_zh_item = CheckMenuItemBuilder::with_id(ID_LANG_ZH, lang_zh_label)
        .checked(lang_zh_checked)
        .build(app)?;
    menu_builder = menu_builder.item(&lang_zh_item);

    menu_builder = menu_builder.separator();

    // Quit
    let quit_item = PredefinedMenuItem::quit(app, Some(quit_label))?;
    menu_builder = menu_builder.item(&quit_item);

    Ok(menu_builder.build()?)
}

/// Rebuild the tray menu (e.g., after profile switch or locale change).
pub fn rebuild_menu<R: Runtime>(app: &AppHandle<R>, app_data_dir: &std::path::Path) {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return,
    };
    let store = match state.store.lock() {
        Ok(s) => s.clone(),
        Err(_) => return,
    };

    if let Ok(menu) = build_tray_menu(app, app_data_dir) {
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_menu(Some(menu));
        }
    }

    // Update tooltip
    let active_name = store
        .profiles
        .iter()
        .find(|p| p.id == store.active_profile_id)
        .map(|p| p.name.as_str())
        .unwrap_or("cc-assist");
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("cc-assist — {}", active_name)));
    }
}

/// Rebuild the tray menu with translated strings (called after locale change).
pub fn rebuild_menu_with_strings<R: Runtime>(
    app: &AppHandle<R>,
    _app_data_dir: &std::path::Path,
    settings_label: &str,
    lang_en_label: &str,
    lang_zh_label: &str,
    quit_label: &str,
) {
    if let Ok(menu) = build_tray_menu_with_strings(
        app,
        settings_label,
        lang_en_label,
        lang_zh_label,
        quit_label,
    ) {
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_menu(Some(menu));
        }
    }

    // Update tooltip
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return,
    };
    let store = match state.store.lock() {
        Ok(s) => s.clone(),
        Err(_) => return,
    };
    let active_name = store
        .profiles
        .iter()
        .find(|p| p.id == store.active_profile_id)
        .map(|p| p.name.as_str())
        .unwrap_or("cc-assist");
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("cc-assist — {}", active_name)));
    }
}

/// Handle a menu item click by ID.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    // Profile switch — catches all IDs not explicitly listed below.
    // This is a "Use" action: writes to settings.json + updates active profile.
    if !id.starts_with("lang-")
        && id != ID_SETTINGS
    {
        let id_string = id.to_string();
        let state = app.state::<AppState>();
        let app_data_dir = state.app_data_dir.lock().unwrap().clone();

        // Find profile, update active, persist config
        let profile = {
            let mut store = state.store.lock().unwrap();
            let profile = match store.profiles.iter().find(|p| p.id == id_string) {
                Some(p) => p.clone(),
                None => return,
            };
            store.active_profile_id = id_string;
            // Persist while lock is held (save_config acquires its own lock internally,
            // but we pass a cloned store_to_save to avoid holding both locks)
            let store_to_save = (*store).clone();
            drop(store);
            if let Err(e) = crate::config::save_config(&app_data_dir, &store_to_save) {
                log::error!("Failed to persist profile switch: {}", e);
                return;
            }
            profile
        };

        // Write profile to ~/.claude/settings.json
        if let Err(e) = settings::apply_profile_to_settings(&profile) {
            log::error!("Failed to write profile to settings.json: {}", e);
        }

        rebuild_menu(app, &app_data_dir);
        return;
    }

    match id {
        ID_SETTINGS => {
            window::show_settings_window(app);
        }
        ID_LANG_EN => {
            let app_clone = app.clone();
            let app_data_dir = app.state::<AppState>().app_data_dir.lock().unwrap().clone();
            tauri::async_runtime::spawn(async move {
                let result = commands::switch_locale("en", &app_clone.state::<AppState>());
                if result.is_err() {
                    log::error!("Failed to switch locale to en");
                    return;
                }
                let _ = app_clone.emit("locale-changed", "en");
                rebuild_menu(&app_clone, &app_data_dir);
            });
        }
        ID_LANG_ZH => {
            let app_clone = app.clone();
            let app_data_dir = app.state::<AppState>().app_data_dir.lock().unwrap().clone();
            tauri::async_runtime::spawn(async move {
                let result = commands::switch_locale("zh", &app_clone.state::<AppState>());
                if result.is_err() {
                    log::error!("Failed to switch locale to zh");
                    return;
                }
                let _ = app_clone.emit("locale-changed", "zh");
                rebuild_menu(&app_clone, &app_data_dir);
            });
        }
        _ => {}
    }
}
