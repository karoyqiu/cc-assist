use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const SETTINGS_LABEL: &str = "settings";
const CHAT_LABEL: &str = "chat";

/// Show the main window (now chat), creating it from config if it doesn't exist.
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    show_chat_window(app);
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

/// Toggle the main (now chat) window.
pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(CHAT_LABEL) {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.close();
            }
            Ok(false) | Err(_) => {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    } else {
        show_chat_window(app);
    }
}

/// Show the chat window, creating it from config if it doesn't exist.
pub fn show_chat_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(CHAT_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let window_config = app.config().app.windows.iter().find(|w| w.label == CHAT_LABEL);

    let builder = match window_config {
        Some(config) => {
            WebviewWindowBuilder::from_config(app, config).unwrap_or_else(|_| {
                WebviewWindowBuilder::new(app, CHAT_LABEL, WebviewUrl::App("chat.html".into()))
            })
        }
        None => {
            WebviewWindowBuilder::new(app, CHAT_LABEL, WebviewUrl::App("chat.html".into()))
        }
    };

    match builder.build() {
        Ok(_) => {
            log::info!("Chat window built and shown");
        }
        Err(e) => {
            log::error!("Failed to create chat window: {}", e);
        }
    }
}
