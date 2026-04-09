use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::state::AppState;
use crate::window;

/// Build the tray icon and menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.state::<AppState>().app_data_dir.clone();
    let menu = build_tray_menu(app, &app_data_dir)?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("cc-assist")
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
    let state = app.try_state::<AppState>().expect("AppState not initialized");
    let store = (*state.store.lock().unwrap()).clone();

    let mut menu_builder = MenuBuilder::new(app);

    // Profile items
    for profile in &store.profiles {
        let is_active = profile.id == store.active_profile_id;
        let label = if is_active {
            format!("✓ {}", profile.name)
        } else {
            profile.name.clone()
        };

        let item = MenuItemBuilder::with_id(profile.id.clone(), label)
            .build(app)?;

        menu_builder = menu_builder.item(&item);
    }

    menu_builder = menu_builder.separator();

    // Launch Claude
    let launch_item = MenuItemBuilder::with_id("launch-claude", "Launch Claude")
        .build(app)?;
    menu_builder = menu_builder.item(&launch_item);

    menu_builder = menu_builder.separator();

    // Settings
    let settings_item = MenuItemBuilder::with_id("settings", "Settings")
        .build(app)?;
    menu_builder = menu_builder.item(&settings_item);

    menu_builder = menu_builder.separator();

    // Language: English
    let lang_en_checked = store.locale == "en";
    let lang_en_label = if lang_en_checked { "✓ English" } else { "English" };
    let lang_en_item = MenuItemBuilder::with_id("lang-en", lang_en_label)
        .build(app)?;
    menu_builder = menu_builder.item(&lang_en_item);

    // Language: Chinese
    let lang_zh_checked = store.locale == "zh";
    let lang_zh_label = if lang_zh_checked { "✓ 中文" } else { "中文" };
    let lang_zh_item = MenuItemBuilder::with_id("lang-zh", lang_zh_label)
        .build(app)?;
    menu_builder = menu_builder.item(&lang_zh_item);

    menu_builder = menu_builder.separator();

    // Quit
    let quit_item = MenuItemBuilder::with_id("quit", "Quit")
        .build(app)?;
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
        .unwrap_or("No profile");
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("cc-assist — {}", active_name)));
    }
}

/// Handle a menu item click by ID.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let app_data_dir = app.state::<AppState>().app_data_dir.clone();

    match id {
        // Profile switch
        id if !id.starts_with("lang-") && id != "launch-claude" && id != "settings" && id != "quit" => {
            let id_clone = id.to_string();
            tauri::async_runtime::spawn({
                let app = app.clone();
                let app_data_dir = app_data_dir.clone();
                let id_clone = id_clone.clone();
                async move {
                    let state = match app.try_state::<AppState>() {
                        Some(s) => s,
                        None => return,
                    };
                    let mut store = match state.store.lock() {
                        Ok(s) => s,
                        Err(_) => return,
                    };
                    if store.active_profile_id != id_clone {
                        store.active_profile_id = id_clone.clone();
                        let _ = crate::config::save_config(&app_data_dir, &store);
                        drop(store);
                        rebuild_menu(&app, &app_data_dir);
                    }
                }
            });
        }
        "launch-claude" => {
            window::show_settings_window(app);
        }
        "settings" => {
            window::show_settings_window(app);
        }
        "lang-en" => {
            tauri::async_runtime::spawn({
                let app = app.clone();
                async move {
                    let state = match app.try_state::<AppState>() {
                        Some(s) => s,
                        None => return,
                    };
                    let mut store = match state.store.lock() {
                        Ok(s) => s,
                        Err(_) => return,
                    };
                    if store.locale != "en" {
                        store.locale = "en".to_string();
                        let app_data_dir = app.state::<AppState>().app_data_dir.clone();
                        let _ = crate::config::save_config(&app_data_dir, &store);
                        drop(store);
                        let _ = app.emit("locale-changed", "en");
                        rebuild_menu(&app, &app_data_dir);
                    }
                }
            });
        }
        "lang-zh" => {
            tauri::async_runtime::spawn({
                let app = app.clone();
                async move {
                    let state = match app.try_state::<AppState>() {
                        Some(s) => s,
                        None => return,
                    };
                    let mut store = match state.store.lock() {
                        Ok(s) => s,
                        Err(_) => return,
                    };
                    if store.locale != "zh" {
                        store.locale = "zh".to_string();
                        let app_data_dir = app.state::<AppState>().app_data_dir.clone();
                        let _ = crate::config::save_config(&app_data_dir, &store);
                        drop(store);
                        let _ = app.emit("locale-changed", "zh");
                        rebuild_menu(&app, &app_data_dir);
                    }
                }
            });
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}
