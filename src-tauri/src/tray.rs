use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

use crate::state::AppState;
use crate::window;

/// Build the tray icon and menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.state::<AppState>().app_data_dir.clone();
    let store = app.state::<AppState>().store.lock()?.clone();
    drop(store);

    let menu = build_tray_menu(app, &app_data_dir)?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .menu_on_left_click(false)
        .tooltip("cc-assist")
        .id("main")
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

/// Rebuild the tray menu (e.g., after profile switch or locale change).
pub fn rebuild_menu<R: Runtime>(app: &AppHandle<R>, app_data_dir: &std::path::Path) {
    let store = match app.state::<AppState>().store.lock() {
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

fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    app_data_dir: &std::path::Path,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let store = app.state::<AppState>().store.lock()?.clone();

    let mut menu_builder = MenuBuilder::new(app);

    // Profile items
    for profile in &store.profiles {
        let is_active = profile.id == store.active_profile_id;
        let label = if is_active {
            format!("✓ {}", profile.name)
        } else {
            profile.name.clone()
        };

        let item = MenuItemBuilder::new(label)
            .id(profile.id.clone())
            .build(app)?;

        // When clicked, switch active profile and rebuild menu
        // Defer to next tick to avoid potential lock order issues
        let profile_id = profile.id.clone();
        let app_clone = app.clone();
        let app_data_dir = app_data_dir.to_path_buf();
        item.on_event(move |_item, _event| {
            let profile_id_inner = profile_id.clone();
            let app_inner = app_clone.clone();
            let app_data_dir_inner = app_data_dir.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(mut state) = app_inner.state::<AppState>().store.lock() {
                    if state.active_profile_id != profile_id_inner {
                        state.active_profile_id = profile_id_inner.clone();
                        let _ = crate::config::save_config(&app_data_dir_inner, &state);
                        drop(state);
                        rebuild_menu(&app_inner, &app_data_dir_inner);
                    }
                }
            });
        })?;

        menu_builder = menu_builder.item(&item);
    }

    menu_builder = menu_builder.separator();

    // Launch Claude
    let launch_item = MenuItemBuilder::new("Launch Claude")
        .id("launch-claude")
        .build(app)?;
    let app_clone = app.clone();
    launch_item.on_event(move |_item, _event| {
        window::show_settings_window(&app_clone);
    })?;
    menu_builder = menu_builder.item(&launch_item);

    menu_builder = menu_builder.separator();

    // Settings
    let settings_item = MenuItemBuilder::new("Settings")
        .id("settings")
        .build(app)?;
    let app_clone2 = app.clone();
    settings_item.on_event(move |_item, _event| {
        window::show_settings_window(&app_clone2);
    })?;
    menu_builder = menu_builder.item(&settings_item);

    menu_builder = menu_builder.separator();

    // Language: English
    let lang_en_checked = store.locale == "en";
    let lang_en_item = MenuItemBuilder::new(if lang_en_checked {
        "✓ English"
    } else {
        "English"
    })
    .id("lang-en")
    .build(app)?;
    let app_clone3 = app.clone();
    lang_en_item.on_event(move |_item, _event| {
        if let Ok(mut state) = app_clone3.state::<AppState>().store.lock() {
            if state.locale != "en" {
                state.locale = "en".to_string();
                let _ = crate::config::save_config(&app_clone3.state::<AppState>().app_data_dir, &state);
                drop(state);
                let _ = app_clone3.emit("locale-changed", "en");
                rebuild_menu(&app_clone3, &app_clone3.state::<AppState>().app_data_dir);
            }
        }
    })?;
    menu_builder = menu_builder.item(&lang_en_item);

    // Language: Chinese
    let lang_zh_checked = store.locale == "zh";
    let lang_zh_item = MenuItemBuilder::new(if lang_zh_checked {
        "✓ 中文"
    } else {
        "中文"
    })
    .id("lang-zh")
    .build(app)?;
    let app_clone4 = app.clone();
    lang_zh_item.on_event(move |_item, _event| {
        if let Ok(mut state) = app_clone4.state::<AppState>().store.lock() {
            if state.locale != "zh" {
                state.locale = "zh".to_string();
                let _ = crate::config::save_config(&app_clone4.state::<AppState>().app_data_dir, &state);
                drop(state);
                let _ = app_clone4.emit("locale-changed", "zh");
                rebuild_menu(&app_clone4, &app_clone4.state::<AppState>().app_data_dir);
            }
        }
    })?;
    menu_builder = menu_builder.item(&lang_zh_item);

    menu_builder = menu_builder.separator();

    // Quit
    let quit_item = MenuItemBuilder::new("Quit")
        .id("quit")
        .build(app)?;
    let app_clone5 = app.clone();
    quit_item.on_event(move |_item, _event| {
        app_clone5.exit(0);
    })?;
    menu_builder = menu_builder.item(&quit_item);

    menu_builder.build()
}
