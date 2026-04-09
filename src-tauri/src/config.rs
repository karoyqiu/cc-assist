use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::types::{AppError, ProfileConfig, ProfilesStore};

pub fn built_in_presets() -> Vec<ProfileConfig> {
    vec![
        ProfileConfig {
            id: "anthropic-official".into(),
            name: "Claude Official".into(),
            icon: "anthropic".into(),
            icon_color: "#D4915D".into(),
            base_url: "https://api.anthropic.com".into(),
            api_key: "".into(),
            models: Default::default(),
            is_built_in: true,
        },
        ProfileConfig {
            id: "zai-international".into(),
            name: "z.ai International".into(),
            icon: "zhipu".into(),
            icon_color: "#0F62FE".into(),
            base_url: "https://api.z.ai/api/anthropic".into(),
            api_key: "".into(),
            models: Default::default(),
            is_built_in: true,
        },
        ProfileConfig {
            id: "zai-cn".into(),
            name: "z.ai CN".into(),
            icon: "zhipu".into(),
            icon_color: "#0F62FE".into(),
            base_url: "https://open.bigmodel.cn/api/anthropic".into(),
            api_key: "".into(),
            models: Default::default(),
            is_built_in: true,
        },
        ProfileConfig {
            id: "minimax-cn".into(),
            name: "MiniMax CN".into(),
            icon: "minimax".into(),
            icon_color: "#FF6B6B".into(),
            base_url: "https://api.minimaxi.com/anthropic".into(),
            api_key: "".into(),
            models: Default::default(),
            is_built_in: true,
        },
        ProfileConfig {
            id: "minimax-international".into(),
            name: "MiniMax International".into(),
            icon: "minimax".into(),
            icon_color: "#FF6B6B".into(),
            base_url: "https://api.minimax.io/anthropic".into(),
            api_key: "".into(),
            models: Default::default(),
            is_built_in: true,
        },
        ProfileConfig {
            id: "kimi".into(),
            name: "Kimi".into(),
            icon: "kimi".into(),
            icon_color: "#6366F1".into(),
            base_url: "https://api.moonshot.cn/anthropic".into(),
            api_key: "".into(),
            models: Default::default(),
            is_built_in: true,
        },
        ProfileConfig {
            id: "deepseek".into(),
            name: "DeepSeek".into(),
            icon: "deepseek".into(),
            icon_color: "#1E88E5".into(),
            base_url: "https://api.deepseek.com/anthropic".into(),
            api_key: "".into(),
            models: Default::default(),
            is_built_in: true,
        },
    ]
}

fn default_store() -> ProfilesStore {
    let presets = built_in_presets();
    let active_profile_id = presets.first().map(|p| p.id.clone()).unwrap_or_default();
    ProfilesStore {
        active_profile_id,
        profiles: presets,
        recent_directories: Default::default(),
        locale: "en".to_string(),
    }
}

/// Load config from the app data dir, creating defaults if absent.
pub fn load_config(app_data_dir: &Path) -> Result<ProfilesStore, AppError> {
    let config_path = app_data_dir.join("config.json");

    if !config_path.exists() {
        let store = default_store();
        save_config(app_data_dir, &store)?;
        return Ok(store);
    }

    let content = fs::read_to_string(&config_path).map_err(AppError::IoError)?;
    let store: ProfilesStore = serde_json::from_str(&content)?;
    Ok(store)
}

/// Atomic save: write to temp file in same dir, then rename.
pub fn save_config(app_data_dir: &Path, store: &ProfilesStore) -> Result<(), AppError> {
    // Ensure directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(app_data_dir).map_err(AppError::IoError)?;
    }

    let config_path = app_data_dir.join("config.json");

    // Atomic: write to temp file then rename
    let mut temp_file = tempfile::NamedTempFile::with_prefix_in("config-", app_data_dir)
        .map_err(AppError::IoError)?;
    let json = serde_json::to_string_pretty(store).map_err(AppError::ConfigParseError)?;
    temp_file.write_all(json.as_bytes()).map_err(AppError::IoError)?;
    temp_file.flush().map_err(AppError::IoError)?;
    temp_file.persist(&config_path).map_err(AppError::IoError)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use tempfile::TempDir;

    #[test]
    fn test_load_config_creates_default_if_missing() {
        let tmp = TempDir::new().unwrap();
        let store = load_config(tmp.path()).unwrap();
        assert_eq!(store.profiles.len(), 7);
        assert_eq!(store.locale, "en");
        assert!(!store.active_profile_id.is_empty());
    }

    #[test]
    fn test_save_and_load_round_trip() {
        let tmp = TempDir::new().unwrap();
        let mut store = default_store();
        store.locale = "zh".to_string();
        save_config(tmp.path(), &store).unwrap();

        let loaded = load_config(tmp.path()).unwrap();
        assert_eq!(loaded.locale, "zh");
        assert_eq!(loaded.profiles.len(), 7);
    }

    #[test]
    fn test_missing_app_dir_on_save_creates_it() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("some").join("nested").join("dir");
        let store = default_store();
        save_config(&nested, &store).unwrap();
        assert!(nested.join("config.json").exists());
    }

    #[test]
    fn test_corrupt_json_returns_error() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("config.json");
        std::fs::write(&path, "{invalid json}").unwrap();
        let result: Result<ProfilesStore, AppError> = load_config(tmp.path());
        assert!(matches!(result, Err(AppError::ConfigParseError(_))));
    }
}
