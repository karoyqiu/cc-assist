use std::io::Write;
use std::sync::Mutex;

mod commands;
mod config;
mod settings;
mod spawn;
mod state;
mod tray;
mod types;
mod window;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Determine app data dir early for logging
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("cc-assist");
    std::fs::create_dir_all(&app_data_dir).ok();

    let log_path = app_data_dir.join("app.log");
    let log_path_for_panic = log_path.clone();

    // Panic handler — log and keep app alive (don't crash to tray)
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

        // Try to write to log file
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path_for_panic)
        {
            let _ = writeln!(f, "{}", log_msg);
        }
    }));

    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .unwrap_or_else(|_| {
            std::fs::File::create(&log_path).expect("Failed to create log file")
        });
    simplelog::WriteLogger::init(
        simplelog::LevelFilter::Info,
        simplelog::Config::default(),
        log_file,
    )
    .ok();

    log::info!("cc-assist starting");

    // Load config
    let store = match config::load_config(&app_data_dir) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to load config: {}", e);
            // Use defaults on error — a single default profile using the anthropic provider
            let providers = config::built_in_providers();
            let anthropic = providers.iter().find(|p| p.id == "anthropic").unwrap();
            let default_profile = crate::types::ProfileConfig {
                id: "default".to_string(),
                name: anthropic.name.clone(),
                icon: anthropic.icon.clone(),
                icon_color: anthropic.icon_color.clone(),
                base_url: anthropic.base_url.clone(),
                api_key: String::new(),
                models: Default::default(),
                provider_id: Some("anthropic".into()),
            };
            crate::types::ProfilesStore {
                active_profile_id: "default".to_string(),
                profiles: vec![default_profile],
                providers,
                recent_directories: Default::default(),
                locale: "en".to_string(),
            }
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_settings_window(app);
        }))
        .manage(AppState {
            store: Mutex::new(store),
            app_data_dir,
        })
        .setup(|app| {
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
            commands::set_active_profile,
            commands::use_profile,
            commands::save_profiles,
            commands::launch_claude,
            commands::pick_directory,
            commands::set_locale,
            commands::check_claude_on_path,
            commands::toggle_settings_window,
            commands::show_settings_window_cmd,
            commands::rebuild_tray_menu,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
