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
const ID_OPEN_TERMINAL: &str = "open-terminal";
const ID_LANG_EN: &str = "lang-en";
const ID_LANG_ZH: &str = "lang-zh";

/// Tray menu translations, keyed by locale.
struct TrayStrings {
    settings: &'static str,
    open_terminal: &'static str,
    lang_en: &'static str,
    lang_zh: &'static str,
    quit: &'static str,
}

fn tray_strings(locale: &str) -> TrayStrings {
    match locale {
        "zh" => TrayStrings {
            settings: "设置",
            open_terminal: "打开终端",
            lang_en: "English",
            lang_zh: "中文",
            quit: "退出",
        },
        _ => TrayStrings {
            settings: "Settings",
            open_terminal: "Open Terminal",
            lang_en: "English",
            lang_zh: "中文",
            quit: "Quit",
        },
    }
}

/// Build the tray icon and menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app)?;

    let tooltip = {
        let state = app.state::<AppState>();
        let store = (*state.store.lock().unwrap()).clone();
        let name = store
            .profiles
            .iter()
            .find(|p| p.id == store.active_profile_id)
            .map(|p| p.name.as_str())
            .unwrap_or("cc-assist");
        let suffix = if cfg!(debug_assertions) { " (dev)" } else { "" };
        format!("cc-assist — {}{}", name, suffix)
    };

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
                window::toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Build the tray menu, reading locale from the store.
fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri::menu::Menu<R>, Box<dyn std::error::Error>> {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return Err("AppState not initialized".into()),
    };
    let store = (*state.store.lock().unwrap()).clone();
    let ts = tray_strings(&store.locale);

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
    let settings_item = MenuItemBuilder::with_id(ID_SETTINGS, ts.settings).build(app)?;
    menu_builder = menu_builder.item(&settings_item);

    // Open Terminal
    let open_terminal_item =
        MenuItemBuilder::with_id(ID_OPEN_TERMINAL, ts.open_terminal).build(app)?;
    menu_builder = menu_builder.item(&open_terminal_item);

    menu_builder = menu_builder.separator();

    // Language: English
    let lang_en_item = CheckMenuItemBuilder::with_id(ID_LANG_EN, ts.lang_en)
        .checked(store.locale == "en")
        .build(app)?;
    menu_builder = menu_builder.item(&lang_en_item);

    // Language: Chinese
    let lang_zh_item = CheckMenuItemBuilder::with_id(ID_LANG_ZH, ts.lang_zh)
        .checked(store.locale == "zh")
        .build(app)?;
    menu_builder = menu_builder.item(&lang_zh_item);

    menu_builder = menu_builder.separator();

    // Quit
    let quit_item = PredefinedMenuItem::quit(app, Some(ts.quit))?;
    menu_builder = menu_builder.item(&quit_item);

    Ok(menu_builder.build()?)
}

/// Rebuild the tray menu (e.g., after profile switch or locale change).
pub fn rebuild_menu<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(menu) = build_tray_menu(app) {
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
        let suffix = if cfg!(debug_assertions) { " (dev)" } else { "" };
        let _ = tray.set_tooltip(Some(format!("cc-assist — {}{}", active_name, suffix)));
    }
}

/// Handle a menu item click by ID.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    // Profile switch — catches all IDs not explicitly listed below.
    if !id.starts_with("lang-") && id != ID_SETTINGS && id != ID_OPEN_TERMINAL {
        let id_string = id.to_string();
        let state = app.state::<AppState>();
        let app_data_dir = state.app_data_dir.lock().unwrap().clone();

        let profile = {
            let mut store = state.store.lock().unwrap();
            let profile = match store.profiles.iter().find(|p| p.id == id_string) {
                Some(p) => p.clone(),
                None => return,
            };
            store.active_profile_id = id_string;
            let store_to_save = (*store).clone();
            drop(store);
            if let Err(e) = crate::config::save_config(&app_data_dir, &store_to_save) {
                log::error!("Failed to persist profile switch: {}", e);
                return;
            }
            profile
        };

        if let Err(e) = settings::apply_profile_to_settings(&profile) {
            log::error!("Failed to write profile to settings.json: {}", e);
        }

        rebuild_menu(app);
        return;
    }

    match id {
        ID_SETTINGS => {
            window::show_settings_window(app);
        }
        ID_OPEN_TERMINAL => {
            window::show_main_window(app);
        }
        ID_LANG_EN => {
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                let result = commands::switch_locale("en", &app_clone.state::<AppState>());
                if result.is_err() {
                    log::error!("Failed to switch locale to en");
                    return;
                }
                let _ = app_clone.emit("locale-changed", "en");
                rebuild_menu(&app_clone);
            });
        }
        ID_LANG_ZH => {
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                let result = commands::switch_locale("zh", &app_clone.state::<AppState>());
                if result.is_err() {
                    log::error!("Failed to switch locale to zh");
                    return;
                }
                let _ = app_clone.emit("locale-changed", "zh");
                rebuild_menu(&app_clone);
            });
        }
        _ => {}
    }
}
