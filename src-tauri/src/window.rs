use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const WINDOW_LABEL: &str = "main";

/// Show the settings window, creating it if it doesn't exist.
pub fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // Create new window from config (hidden until frontend signals ready)
    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == WINDOW_LABEL);

    let builder = match window_config {
        Some(config) => {
            WebviewWindowBuilder::from_config(app, config).unwrap_or_else(|_| {
                WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            })
        }
        None => {
            WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        }
    };

    match builder.visible(false).build() {
        Ok(_) => {}
        Err(e) => {
            log::error!("Failed to create settings window: {}", e);
        }
    }
}

/// Show the terminal window, creating it if it doesn't exist.
pub fn show_terminal_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("terminal") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "terminal");

    let builder = match window_config {
        Some(config) => {
            WebviewWindowBuilder::from_config(app, config).unwrap_or_else(|_| {
                WebviewWindowBuilder::new(app, "terminal", WebviewUrl::App("index.html".into()))
            })
        }
        None => {
            WebviewWindowBuilder::new(app, "terminal", WebviewUrl::App("index.html".into()))
        }
    };

    match builder.visible(true).build() {
        Ok(_) => {}
        Err(e) => {
            log::error!("Failed to create terminal window: {}", e);
        }
    }
}

/// Toggle the settings window (show if hidden, hide if shown).
pub fn toggle_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            Ok(false) => {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Err(e) => {
                log::warn!("is_visible check failed: {}, treating as hidden", e);
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    } else {
        show_settings_window(app);
    }
}
