use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const MAIN_LABEL: &str = "main";
const SETTINGS_LABEL: &str = "settings";

/// Show the main (terminal) window, creating it from config if it doesn't exist.
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == MAIN_LABEL);

    let builder = match window_config {
        Some(config) => {
            WebviewWindowBuilder::from_config(app, config).unwrap_or_else(|_| {
                WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::App("index.html".into()))
            })
        }
        None => {
            WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::App("index.html".into()))
        }
    };

    match builder.build() {
        Ok(_) => {
            log::info!("Main window built and shown");
        }
        Err(e) => {
            log::error!("Failed to create main window: {}", e);
        }
    }
}

/// Show the settings window, creating it from config if it doesn't exist.
pub fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == SETTINGS_LABEL);

    let builder = match window_config {
        Some(config) => {
            WebviewWindowBuilder::from_config(app, config).unwrap_or_else(|_| {
                WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
            })
        }
        None => {
            WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
        }
    };

    match builder.build() {
        Ok(_) => {
            log::info!("Settings window built and shown");
        }
        Err(e) => {
            log::error!("Failed to create settings window: {}", e);
        }
    }
}

/// Toggle the main (terminal) window.
pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            Ok(false) | Err(_) => {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    } else {
        show_main_window(app);
    }
}
