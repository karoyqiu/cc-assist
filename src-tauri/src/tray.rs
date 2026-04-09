use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::commands::{self};
use crate::state::AppState;
use crate::window;

// Menu item ID constants — cross-referenced across build_tray_menu and handle_menu_event.
const ID_LAUNCH_CLAUDE: &str = "launch-claude";
const ID_SETTINGS: &str = "settings";
const ID_LANG_EN: &str = "lang-en";
const ID_LANG_ZH: &str = "lang-zh";
const ID_QUIT: &str = "quit";

/// Build the tray icon and menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.state::<AppState>().app_data_dir.clone();

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
    let launch_item = MenuItemBuilder::with_id(ID_LAUNCH_CLAUDE, "Launch Claude")
        .build(app)?;
    menu_builder = menu_builder.item(&launch_item);

    menu_builder = menu_builder.separator();

    // Settings
    let settings_item = MenuItemBuilder::with_id(ID_SETTINGS, "Settings")
        .build(app)?;
    menu_builder = menu_builder.item(&settings_item);

    menu_builder = menu_builder.separator();

    // Language: English
    let lang_en_checked = store.locale == "en";
    let lang_en_label = if lang_en_checked { "✓ English" } else { "English" };
    let lang_en_item = MenuItemBuilder::with_id(ID_LANG_EN, lang_en_label)
        .build(app)?;
    menu_builder = menu_builder.item(&lang_en_item);

    // Language: Chinese
    let lang_zh_checked = store.locale == "zh";
    let lang_zh_label = if lang_zh_checked { "✓ 中文" } else { "中文" };
    let lang_zh_item = MenuItemBuilder::with_id(ID_LANG_ZH, lang_zh_label)
        .build(app)?;
    menu_builder = menu_builder.item(&lang_zh_item);

    menu_builder = menu_builder.separator();

    // Quit
    let quit_item = MenuItemBuilder::with_id(ID_QUIT, "Quit")
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
        .unwrap_or("cc-assist");
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("cc-assist — {}", active_name)));
    }
}

/// Handle a menu item click by ID.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    // Profile switch — catches all IDs not explicitly listed below.
    if !id.starts_with("lang-")
        && id != ID_LAUNCH_CLAUDE
        && id != ID_SETTINGS
        && id != ID_QUIT
    {
        let id_clone = id.to_string();
        let app_data_dir = app.state::<AppState>().app_data_dir.clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let result = commands::switch_active_profile(&id_clone, &app_clone.state::<AppState>());
            if let Err(e) = result {
                log::error!("Failed to switch profile: {}", e);
                return;
            }
            rebuild_menu(&app_clone, &app_data_dir);
        });
        return;
    }

    match id {
        ID_LAUNCH_CLAUDE => {
            // Emit event so the frontend shows the DirectoryPicker modal.
            let _ = app.emit("show-directory-picker", ());
        }
        ID_SETTINGS => {
            window::show_settings_window(app);
        }
        ID_LANG_EN => {
            let app_clone = app.clone();
            let app_data_dir = app.state::<AppState>().app_data_dir.clone();
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
            let app_data_dir = app.state::<AppState>().app_data_dir.clone();
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
        ID_QUIT => {
            app.exit(0);
        }
        _ => {}
    }
}
