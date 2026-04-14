use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const WINDOW_LABEL: &str = "main";

/// Show the settings window, creating it if it doesn't exist.
pub fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    log::info!("show_settings_window called");
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        log::info!("Found existing settings window, showing it");
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    log::info!("No existing settings window, creating new one");

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

    match builder.visible(true).build() {
        Ok(_) => {
            log::info!("Settings window built and shown");
        }
        Err(e) => {
            log::error!("Failed to create settings window: {}", e);
        }
    }
}

/// Show the terminal window, creating it if it doesn't exist.
pub fn show_terminal_window<R: Runtime>(app: &AppHandle<R>) {
    log::info!("show_terminal_window called");
    if let Some(window) = app.get_webview_window("terminal") {
        log::info!("Found existing terminal window, showing it");
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    log::info!("No existing terminal window, creating new one");

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
        Ok(_) => {
            log::info!("Terminal window built successfully");
        }
        Err(e) => {
            log::error!("Failed to create terminal window: {}", e);
        }
    }
}

/// Toggle the settings window (show if hidden, hide if shown).
pub fn toggle_settings_window<R: Runtime>(app: &AppHandle<R>) {
    log::info!("toggle_settings_window called");
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        match window.is_visible() {
            Ok(true) => {
                log::info!("Settings window visible, hiding it");
                let _ = window.hide();
            }
            Ok(false) => {
                log::info!("Settings window hidden, showing it");
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
        log::info!("No settings window found, creating one");
        show_settings_window(app);
    }
}
