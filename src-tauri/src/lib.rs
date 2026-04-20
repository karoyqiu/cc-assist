use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;

mod chat;
mod commands;
mod commands_chat;
mod config;
mod settings;
mod state;
mod terminal;
mod tray;
mod types;
mod window;

use state::{AppState, ChatSessionManager};
use tauri::Manager;

fn default_store() -> crate::types::ProfilesStore {
    crate::types::ProfilesStore {
        active_profile_id: "default".to_string(),
        profiles: Vec::new(),
        recent_directories: Default::default(),
        locale: "en".to_string(),
        terminal_font_family: crate::types::default_terminal_font_family(),
        terminal_font_size: crate::types::default_terminal_font_size(),
    }
}

fn init_logging(log_dir: &std::path::Path) {
    std::fs::create_dir_all(log_dir).ok();
    let log_path = log_dir.join("app.log");

    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .unwrap_or_else(|_| std::fs::File::create(&log_path).expect("Failed to create log file"));
    simplelog::WriteLogger::init(simplelog::LevelFilter::Info, simplelog::Config::default(), log_file).ok();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Use temp dir for early panic logging — we'll get proper dir from Tauri in setup
    let early_log_dir = std::env::temp_dir().join("cc-assist");
    std::fs::create_dir_all(&early_log_dir).ok();

    // Set up panic handler early
    let panic_log_path = early_log_dir.join("app.log");
    std::panic::set_hook(Box::new(move |panic_info| {
        let msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let log_msg = format!("PANIC at {}: {}", location, msg);
        eprintln!("{}", log_msg);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&panic_log_path) {
            let _ = writeln!(f, "{}", log_msg);
        }
    }));

    // Init logging with temp dir initially
    init_logging(&early_log_dir);
    log::info!("cc-assist starting");

    // Create builder with default store — will be replaced in setup with proper config
    let store = default_store();

    let mut builder = tauri::Builder::default();
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main_window(app);
        }));
    }
    builder = builder.plugin(tauri_plugin_clipboard_manager::init());
    builder = builder.plugin(tauri_plugin_system_fonts::init());
    builder
        .manage(AppState {
            store: Mutex::new(store),
            app_data_dir: Mutex::new(early_log_dir.clone()),
            sessions: Mutex::new(HashMap::new()),
            chat_sessions: ChatSessionManager {
                sessions: Mutex::new(HashMap::new()),
            },
            app_handle: Mutex::new(None),
        })
        .setup(|app| {
            // Get proper app data dir from Tauri using Manager trait
            let app_data_dir = match app.path().app_data_dir() {
                Ok(dir) => {
                    log::info!("Using app data dir: {:?}", dir);
                    dir
                }
                Err(e) => {
                    log::error!("Failed to get app data dir: {}, using fallback", e);
                    std::env::temp_dir().join("cc-assist")
                }
            };

            // Re-init logging with proper dir
            init_logging(&app_data_dir);

            // Update state with proper app_data_dir
            let state = app.state::<AppState>();
            *state.app_data_dir.lock().unwrap() = app_data_dir.clone();

            // Load config from proper app data dir
            let store = match config::load_config(&app_data_dir) {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Failed to load config: {}", e);
                    default_store()
                }
            };
            *state.store.lock().unwrap() = store;

            // Store app handle for use in commands
            *state.app_handle.lock().unwrap() = Some(app.handle().clone());

            // Set up tray
            if let Err(e) = tray::setup_tray(app.handle()) {
                log::error!("Failed to setup tray: {}", e);
            }

            // Register menu event handler (for tray menu item clicks)
            app.on_menu_event(|app, event| {
                tray::handle_menu_event(app, event.id().as_ref());
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::get_providers,
            commands::set_active_profile,
            commands::use_profile,
            commands::save_profiles,
            commands::pick_directory,
            commands::set_locale,
            commands::toggle_settings_window,
            commands::terminal_create_session,
            commands::launch_terminal,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_close_session,
            commands::terminal_list_sessions,
            commands::save_terminal_font_settings,
            commands_chat::chat_create_session,
            commands_chat::chat_send_message,
            commands_chat::chat_list_sessions,
            commands_chat::chat_get_recent_sessions,
            commands_chat::chat_delete_sessions,
            commands_chat::chat_rename_session,
            commands_chat::chat_resume_session,
            commands_chat::chat_close_session,
            commands_chat::chat_set_permission_mode,
            commands_chat::chat_get_token_usage,
            commands_chat::chat_cancel,
            commands_chat::chat_undo,
            commands_chat::chat_redo,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
