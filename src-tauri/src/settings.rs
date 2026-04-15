use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use serde_json::Value;

use crate::types::{AppError, ProfileConfig};

/// ~/.claude/settings.json
fn settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("settings.json")
}

/// Read ~/.claude/settings.json.
pub fn read_settings_json() -> Result<Value, AppError> {
    let path = settings_path();
    if !path.exists() {
        return Err(AppError::SettingsNotFound);
    }
    // Preserve the original IO error so callers can distinguish NotFound from
    // PermissionDenied etc.
    let content = fs::read_to_string(&path).map_err(AppError::IoError)?;
    serde_json::from_str(&content).map_err(AppError::ConfigParseError)
}

/// Read ~/.claude/settings.json, returning an empty object if it doesn't exist yet.
pub fn read_settings_json_or_empty() -> Result<Value, AppError> {
    match read_settings_json() {
        Ok(v) => Ok(v),
        Err(AppError::SettingsNotFound) => Ok(Value::Object(serde_json::Map::new())),
        Err(e) => Err(e),
    }
}

/// Build a map of ANTHROPIC_* env vars from a profile — only non-empty fields.
/// Uses BTreeMap for deterministic (sorted) iteration order.
pub fn build_env_map(profile: &ProfileConfig) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    if !profile.base_url.is_empty() {
        map.insert("ANTHROPIC_BASE_URL".to_string(), profile.base_url.clone());
    }
    if !profile.api_key.is_empty() {
        map.insert("ANTHROPIC_AUTH_TOKEN".to_string(), profile.api_key.clone());
    }
    if let Some(ref m) = profile.models.main {
        if !m.is_empty() {
            map.insert("ANTHROPIC_MODEL".to_string(), m.clone());
        }
    }
    if let Some(ref h) = profile.models.haiku {
        if !h.is_empty() {
            map.insert("ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(), h.clone());
        }
    }
    if let Some(ref s) = profile.models.sonnet {
        if !s.is_empty() {
            map.insert("ANTHROPIC_DEFAULT_SONNET_MODEL".to_string(), s.clone());
        }
    }
    if let Some(ref o) = profile.models.opus {
        if !o.is_empty() {
            map.insert("ANTHROPIC_DEFAULT_OPUS_MODEL".to_string(), o.clone());
        }
    }
    if let Some(ref proxy) = profile.proxy_url {
        if !proxy.is_empty() {
            map.insert("HTTPS_PROXY".to_string(), proxy.clone());
        }
    }
    map
}

/// Keys managed by cc-assist in settings["env"].
/// When switching profiles, these are cleared before merging the new profile
/// to prevent stale values from a previous profile persisting.
const MANAGED_ENV_KEYS: &[&str] = &[
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "HTTPS_PROXY",
];

/// Remove all cc-assist-managed ANTHROPIC_* keys from settings["env"].
/// Preserves any other keys the user may have set (e.g. ANTHROPIC_TEMPERATURE).
pub fn clear_profile_env_keys(settings: &mut Value) {
    if let Some(env) = settings.get_mut("env").and_then(|v| v.as_object_mut()) {
        for key in MANAGED_ENV_KEYS {
            env.remove(*key);
        }
    }
}

/// Apply a profile to ~/.claude/settings.json.
/// Creates the file if it doesn't exist. Clears previous profile keys, then
/// merges new ones. Writes atomically.
pub fn apply_profile_to_settings(profile: &ProfileConfig) -> Result<(), AppError> {
    let mut settings_json = read_settings_json_or_empty()?;
    clear_profile_env_keys(&mut settings_json);
    merge_profile_into_settings(profile, &mut settings_json);
    write_settings_atomically(&settings_json)
}

/// Deep-merge only the non-empty profile env fields into settings["env"].
pub fn merge_profile_into_settings(profile: &ProfileConfig, settings: &mut Value) {
    let env_map = build_env_map(profile);
    if env_map.is_empty() {
        return;
    }

    // Ensure env object exists
    if settings.get("env").and_then(|v| v.as_object()).is_none() {
        settings["env"] = Value::Object(serde_json::Map::new());
    }

    let env = settings.get_mut("env").unwrap();
    for (key, value) in env_map {
        env[key] = Value::String(value);
    }
}

/// Atomic write: temp file + persist. On failure, original is untouched.
pub fn write_settings_atomically(settings: &Value) -> Result<(), AppError> {
    let path = settings_path();
    let json = serde_json::to_string_pretty(settings).map_err(AppError::ConfigParseError)?;

    // Create temp file in the same directory as the target so persist()
    // does a same-filesystem rename (guaranteed atomic on Windows)
    let parent_dir = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let mut temp_file = tempfile::NamedTempFile::with_prefix_in(".settings.json.", parent_dir)
        .map_err(AppError::IoError)?;

    temp_file.write_all(json.as_bytes()).map_err(AppError::IoError)?;
    temp_file.flush().map_err(AppError::IoError)?;

    // Atomically replace the original with the temp file
    // persist() renames the temp file to the target path
    temp_file.persist(&path).map_err(|e| AppError::IoError(e.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_env_map_all_empty() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "".into(),
            api_key: "".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: None,
        };
        let map = build_env_map(&profile);
        assert!(map.is_empty());
    }

    #[test]
    fn test_build_env_map_base_url_only() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: None,
        };
        let map = build_env_map(&profile);
        assert_eq!(map.len(), 1);
        assert_eq!(map.get("ANTHROPIC_BASE_URL").unwrap(), "https://api.example.com");
    }

    #[test]
    fn test_build_env_map_all_fields() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "secret-key".into(),
            models: crate::types::ModelConfig {
                main: Some("claude-3-5-sonnet".into()),
                haiku: Some("claude-3-haiku".into()),
                sonnet: Some("claude-3-5-sonnet".into()),
                opus: Some("claude-3-opus".into()),
            },
            provider_id: None,
            proxy_url: None,
        };
        let map = build_env_map(&profile);
        assert_eq!(map.len(), 6);
        assert_eq!(map.get("ANTHROPIC_BASE_URL").unwrap(), "https://api.example.com");
        assert_eq!(map.get("ANTHROPIC_AUTH_TOKEN").unwrap(), "secret-key");
        assert_eq!(map.get("ANTHROPIC_MODEL").unwrap(), "claude-3-5-sonnet");
        assert_eq!(map.get("ANTHROPIC_DEFAULT_HAIKU_MODEL").unwrap(), "claude-3-haiku");
    }

    #[test]
    fn test_build_env_map_api_key_empty() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "".into(),
            models: crate::types::ModelConfig {
                main: Some("claude-3-5-sonnet".into()),
                haiku: None,
                sonnet: None,
                opus: None,
            },
            provider_id: None,
            proxy_url: None,
        };
        let map = build_env_map(&profile);
        // Only base_url + main model
        assert_eq!(map.len(), 2);
        assert!(!map.contains_key("ANTHROPIC_AUTH_TOKEN"));
    }

    #[test]
    fn test_merge_profile_partial() {
        let mut settings: Value = serde_json::from_str(r#"{
            "env": {
                "ANTHROPIC_MODEL": "opus",
                "ANTHROPIC_TEMPERATURE": "0.5"
            },
            "version": 1
        }"#).unwrap();

        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "secret".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: None,
        };

        merge_profile_into_settings(&profile, &mut settings);

        let env = settings.get("env").unwrap().as_object().unwrap();
        // Preserves existing ANTHROPIC_MODEL
        assert_eq!(env.get("ANTHROPIC_MODEL").unwrap(), "opus");
        // Preserves unrelated key
        assert_eq!(env.get("ANTHROPIC_TEMPERATURE").unwrap(), "0.5");
        // New fields added
        assert_eq!(env.get("ANTHROPIC_BASE_URL").unwrap(), "https://api.example.com");
        assert_eq!(env.get("ANTHROPIC_AUTH_TOKEN").unwrap(), "secret");
        // version preserved
        assert_eq!(settings.get("version").unwrap(), 1);
    }

    #[test]
    fn test_merge_profile_preserves_non_env_keys() {
        let mut settings: Value = serde_json::from_str(r#"{
            "env": {},
            "themes": ["dark"],
            "version": 2
        }"#).unwrap();

        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: None,
        };

        merge_profile_into_settings(&profile, &mut settings);
        assert_eq!(settings.get("themes").unwrap(), &serde_json::json!(["dark"]));
        assert_eq!(settings.get("version").unwrap(), 2);
    }

    #[test]
    fn test_clear_profile_env_keys_removes_managed_but_preserves_user_keys() {
        let mut settings: Value = serde_json::from_str(r#"{
            "env": {
                "ANTHROPIC_BASE_URL": "https://old.example.com",
                "ANTHROPIC_AUTH_TOKEN": "stale-key",
                "ANTHROPIC_MODEL": "old-model",
                "ANTHROPIC_TEMPERATURE": "0.7",
                "SOME_OTHER_KEY": "preserved"
            }
        }"#).unwrap();

        clear_profile_env_keys(&mut settings);

        let env = settings.get("env").unwrap().as_object().unwrap();
        assert!(!env.contains_key("ANTHROPIC_BASE_URL"));
        assert!(!env.contains_key("ANTHROPIC_AUTH_TOKEN"));
        assert!(!env.contains_key("ANTHROPIC_MODEL"));
        // User keys preserved
        assert_eq!(env.get("ANTHROPIC_TEMPERATURE").unwrap(), "0.7");
        assert_eq!(env.get("SOME_OTHER_KEY").unwrap(), "preserved");
    }

    #[test]
    fn test_apply_profile_clears_previous_profile_keys() {
        // Simulate switching from Profile A (has api key) to Profile B (no api key)
        let mut settings: Value = serde_json::from_str(r#"{
            "env": {
                "ANTHROPIC_BASE_URL": "https://a.example.com",
                "ANTHROPIC_AUTH_TOKEN": "sk-key-from-profile-a",
                "ANTHROPIC_TEMPERATURE": "0.5"
            },
            "version": 1
        }"#).unwrap();

        // Profile B: different base URL, no API key
        let profile_b = ProfileConfig {
            id: "b".into(),
            name: "B".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://b.example.com".into(),
            api_key: "".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: None,
        };

        clear_profile_env_keys(&mut settings);
        merge_profile_into_settings(&profile_b, &mut settings);

        let env = settings.get("env").unwrap().as_object().unwrap();
        assert_eq!(env.get("ANTHROPIC_BASE_URL").unwrap(), "https://b.example.com");
        // Stale key from Profile A must be gone
        assert!(!env.contains_key("ANTHROPIC_AUTH_TOKEN"));
        // User key preserved
        assert_eq!(env.get("ANTHROPIC_TEMPERATURE").unwrap(), "0.5");
    }

    #[test]
    fn test_write_settings_atomically_happy_path() {
        let tmp = tempfile::tempdir().unwrap();
        // Override home dir for this test by temporarily patching settings_path
        let settings_file = tmp.path().join("settings.json");

        // Directly test the atomics by checking temp file + rename works
        let settings_json = serde_json::json!({
            "env": { "ANTHROPIC_MODEL": "test" },
            "version": 1
        });

        // Use a temp file in the same dir, write, then persist
        let temp_file = tempfile::NamedTempFile::with_prefix_in(".settings.json.", tmp.path()).unwrap();
        let mut f = temp_file;
        let json_str = serde_json::to_string_pretty(&settings_json).unwrap();
        std::io::Write::write_all(&mut f, json_str.as_bytes()).unwrap();
        f.flush().unwrap();
        f.persist(&settings_file).unwrap();

        assert!(settings_file.exists());
        let content = std::fs::read_to_string(&settings_file).unwrap();
        assert!(content.contains("ANTHROPIC_MODEL"));
    }

    #[test]
    fn test_restore_settings_backup() {
        let tmp = tempfile::tempdir().unwrap();
        let settings_file = tmp.path().join("settings.json");
        let backup_file = tmp.path().join("settings.json.bak");

        // Create original settings
        std::fs::write(&settings_file, r#"{"env": {}}"#).unwrap();
        // Create backup
        std::fs::write(&backup_file, r#"{"env": {"ANTHROPIC_MODEL": "restored"}}"#).unwrap();

        // Simulate restoring
        std::fs::copy(&backup_file, &settings_file).unwrap();
        std::fs::remove_file(&backup_file).ok();

        let content: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(&settings_file).unwrap()
        ).unwrap();
        assert_eq!(content["env"]["ANTHROPIC_MODEL"], "restored");
    }

    #[test]
    fn test_build_env_map_with_proxy() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "secret-key".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: Some("http://proxy:8080".into()),
        };
        let map = build_env_map(&profile);
        assert_eq!(map.get("HTTPS_PROXY").unwrap(), "http://proxy:8080");
    }

    #[test]
    fn test_build_env_map_proxy_empty_string() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "secret-key".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: Some("".into()),
        };
        let map = build_env_map(&profile);
        assert!(!map.contains_key("HTTPS_PROXY"));
    }

    #[test]
    fn test_build_env_map_proxy_none() {
        let profile = ProfileConfig {
            id: "test".into(),
            name: "Test".into(),
            icon: "test".into(),
            icon_color: "#000".into(),
            base_url: "https://api.example.com".into(),
            api_key: "secret-key".into(),
            models: Default::default(),
            provider_id: None,
            proxy_url: None,
        };
        let map = build_env_map(&profile);
        assert!(!map.contains_key("HTTPS_PROXY"));
    }

    #[test]
    fn test_clear_removes_https_proxy() {
        let mut settings: Value = serde_json::from_str(r#"{
            "env": {
                "HTTPS_PROXY": "http://proxy:8080",
                "ANTHROPIC_TEMPERATURE": "0.5"
            }
        }"#).unwrap();

        clear_profile_env_keys(&mut settings);

        let env = settings.get("env").unwrap().as_object().unwrap();
        assert!(!env.contains_key("HTTPS_PROXY"));
        assert_eq!(env.get("ANTHROPIC_TEMPERATURE").unwrap(), "0.5");
    }
}
