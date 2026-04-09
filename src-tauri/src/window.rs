use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

const WINDOW_LABEL: &str = "main";
const WINDOW_TITLE: &str = "cc-assist";
const WINDOW_WIDTH: f64 = 700.0;
const WINDOW_HEIGHT: f64 = 500.0;

/// Show the settings window, creating it if it doesn't exist.
pub fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // Create new window
    match WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title(WINDOW_TITLE)
        .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
        .resizable(true)
        .center()
        .build()
    {
        Ok(_) => {}
        Err(e) => {
            log::error!("Failed to create settings window: {}", e);
        }
    }
}

/// Toggle the settings window (show if hidden, hide if shown).
pub fn toggle_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    } else {
        show_settings_window(app);
    }
}
