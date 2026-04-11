use std::fs;
use std::io::Write;
use std::path::Path;

use crate::types::{AppError, ProviderConfig, ProfilesStore};

pub fn built_in_providers() -> Vec<ProviderConfig> {
    vec![
        ProviderConfig {
            id: "anthropic".into(),
            name: "Claude Official".into(),
            icon: "anthropic".into(),
            icon_color: "#D4915D".into(),
            base_url: String::new(),
        },
        ProviderConfig {
            id: "zai-international".into(),
            name: "z.ai International".into(),
            icon: "zhipu".into(),
            icon_color: "#0F62FE".into(),
            base_url: "https://api.z.ai/api/anthropic".into(),
        },
        ProviderConfig {
            id: "zai-cn".into(),
            name: "z.ai CN".into(),
            icon: "zhipu".into(),
            icon_color: "#0F62FE".into(),
            base_url: "https://open.bigmodel.cn/api/anthropic".into(),
        },
        ProviderConfig {
            id: "minimax-cn".into(),
            name: "MiniMax CN".into(),
            icon: "minimax".into(),
            icon_color: "#FF6B6B".into(),
            base_url: "https://api.minimaxi.com/anthropic".into(),
        },
        ProviderConfig {
            id: "minimax-international".into(),
            name: "MiniMax International".into(),
            icon: "minimax".into(),
            icon_color: "#FF6B6B".into(),
            base_url: "https://api.minimax.io/anthropic".into(),
        },
        ProviderConfig {
            id: "kimi".into(),
            name: "Kimi".into(),
            icon: "kimi".into(),
            icon_color: "#6366F1".into(),
            base_url: "https://api.moonshot.cn/anthropic".into(),
        },
        ProviderConfig {
            id: "deepseek".into(),
            name: "DeepSeek".into(),
            icon: "deepseek".into(),
            icon_color: "#1E88E5".into(),
            base_url: "https://api.deepseek.com/anthropic".into(),
        },
    ]
}

fn default_store() -> ProfilesStore {
    let providers = built_in_providers();
    let active_profile_id = providers.first().map(|p| format!("{}-default", p.id)).unwrap_or_default();
    ProfilesStore {
        active_profile_id,
        profiles: Vec::new(),
        providers,
        recent_directories: Default::default(),
        locale: "en".to_string(),
    }
}

/// Load config from the app data dir, creating defaults if absent.
/// Handles backward compatibility:
/// - Missing `providers` field: inject from built_in_providers()
/// - Existing profiles with `is_built_in` field: silently drop (field not in new schema)
pub fn load_config(app_data_dir: &Path) -> Result<ProfilesStore, AppError> {
    let config_path = app_data_dir.join("config.json");

    if !config_path.exists() {
        let store = default_store();
        save_config(app_data_dir, &store)?;
        return Ok(store);
    }

    let content = fs::read_to_string(&config_path).map_err(AppError::IoError)?;

    // First pass: deserialize with ignoring unknown fields (handles old is_built_in)
    let store: ProfilesStore = serde_json::from_str(&content)
        .map_err(AppError::ConfigParseError)?;

    // Inject providers if missing (backward compat for old config files without providers field)
    if store.providers.is_empty() {
        Ok(ProfilesStore {
            providers: built_in_providers(),
            ..store
        })
    } else {
        Ok(store)
    }
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
    temp_file.persist(&config_path).map_err(|e| AppError::IoError(e.error))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_load_config_creates_default_if_missing() {
        let tmp = TempDir::new().unwrap();
        let store = load_config(tmp.path()).unwrap();
        // Default store has 0 profiles and 7 built-in providers
        assert_eq!(store.profiles.len(), 0);
        assert_eq!(store.providers.len(), 7);
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
        assert_eq!(loaded.providers.len(), 7);
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

    #[test]
    fn test_migration_old_profile_with_is_built_in() {
        // Old config format with is_built_in on profiles (no providers field)
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("config.json");
        let old_json = serde_json::json!({
            "active_profile_id": "anthropic-official",
            "profiles": [
                {
                    "id": "anthropic-official",
                    "name": "Claude Official",
                    "icon": "anthropic",
                    "icon_color": "#D4915D",
                    "base_url": "https://api.anthropic.com",
                    "api_key": "",
                    "models": {},
                    "is_built_in": true
                }
            ],
            "recent_directories": {},
            "locale": "en"
        });
        std::fs::write(&path, old_json.to_string()).unwrap();

        let store = load_config(tmp.path()).unwrap();
        // is_built_in was dropped; profile preserved with original fields
        assert_eq!(store.profiles.len(), 1);
        assert_eq!(store.profiles[0].name, "Claude Official");
        // providers injected from built_in_providers()
        assert_eq!(store.providers.len(), 7);
    }

    #[test]
    fn test_migration_profile_base_url_not_matching_any_provider() {
        // Profile with custom base_url — no provider match expected
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("config.json");
        let old_json = serde_json::json!({
            "active_profile_id": "my-custom",
            "profiles": [
                {
                    "id": "my-custom",
                    "name": "My Custom",
                    "icon": "custom",
                    "icon_color": "#123456",
                    "base_url": "https://my-custom.endpoint.com",
                    "api_key": "sk-custom",
                    "models": {}
                }
            ],
            "recent_directories": {},
            "locale": "en"
        });
        std::fs::write(&path, old_json.to_string()).unwrap();

        let store = load_config(tmp.path()).unwrap();
        assert_eq!(store.profiles.len(), 1);
        assert_eq!(store.profiles[0].base_url, "https://my-custom.endpoint.com");
        assert_eq!(store.providers.len(), 7);
    }

    #[test]
    fn test_migration_profile_without_provider_id_is_custom() {
        // Profile created before provider_id field was added — should deserialize as None (custom)
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("config.json");
        let old_json = serde_json::json!({
            "active_profile_id": "old-profile",
            "profiles": [
                {
                    "id": "old-profile",
                    "name": "Old Custom Profile",
                    "icon": "custom",
                    "icon_color": "#123456",
                    "base_url": "https://api.anthropic.com",
                    "api_key": "sk-old",
                    "models": {}
                }
            ],
            "recent_directories": {},
            "locale": "en"
        });
        std::fs::write(&path, old_json.to_string()).unwrap();

        let store = load_config(tmp.path()).unwrap();
        assert_eq!(store.profiles.len(), 1);
        // Absent provider_id field → None (custom, editable)
        assert_eq!(store.profiles[0].provider_id, None);
    }

    #[test]
    fn test_profile_with_provider_id_round_trips() {
        // Profile with provider_id="anthropic" survives save → load round-trip
        let tmp = TempDir::new().unwrap();
        let mut store = default_store();
        store.profiles.push(crate::types::ProfileConfig {
            id: "official".into(),
            name: "Claude Official".into(),
            icon: "anthropic".into(),
            icon_color: "#D4915D".into(),
            base_url: "https://api.anthropic.com".into(),
            api_key: "sk-ant".into(),
            models: Default::default(),
            provider_id: Some("anthropic".into()),
        });
        save_config(tmp.path(), &store).unwrap();

        let loaded = load_config(tmp.path()).unwrap();
        assert_eq!(loaded.profiles.len(), 1); // only the official profile we added
        let official = loaded.profiles.iter().find(|p| p.id == "official").unwrap();
        assert_eq!(official.provider_id, Some("anthropic".into()));
    }
}
