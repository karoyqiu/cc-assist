use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Model configuration — maps to ANTHROPIC_* env vars.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ModelConfig {
    /// → ANTHROPIC_MODEL
    #[serde(rename = "main", skip_serializing_if = "Option::is_none")]
    pub main: Option<String>,
    /// → ANTHROPIC_DEFAULT_HAIKU_MODEL
    #[serde(rename = "haiku", skip_serializing_if = "Option::is_none")]
    pub haiku: Option<String>,
    /// → ANTHROPIC_DEFAULT_SONNET_MODEL
    #[serde(rename = "sonnet", skip_serializing_if = "Option::is_none")]
    pub sonnet: Option<String>,
    /// → ANTHROPIC_DEFAULT_OPUS_MODEL
    #[serde(rename = "opus", skip_serializing_if = "Option::is_none")]
    pub opus: Option<String>,
}

/// A built-in provider preset — templates for profile creation.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProviderConfig {
    /// Stable kebab-case identifier, e.g. "anthropic", "deepseek"
    pub id: String,
    /// Display name, e.g. "Claude Official"
    pub name: String,
    /// Icon identifier e.g. "anthropic", "zhipu", "minimax", "kimi", "deepseek"
    pub icon: String,
    /// Hex color e.g. "#D4915D"
    pub icon_color: String,
    /// → ANTHROPIC_BASE_URL
    pub base_url: String,
}

/// A user profile — owns all fields independently after creation.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProfileConfig {
    pub id: String,
    pub name: String,
    /// Icon identifier e.g. "anthropic", "zhipu", "minimax", "kimi", "deepseek"
    pub icon: String,
    /// Hex color e.g. "#D4915D"
    pub icon_color: String,
    /// → ANTHROPIC_BASE_URL
    pub base_url: String,
    /// → ANTHROPIC_AUTH_TOKEN
    pub api_key: String,
    pub models: ModelConfig,
}

/// Recent directories per profile — last 10 per profile, LRU ordering (most recent first).
pub type RecentDirectories = HashMap<String, Vec<String>>;

/// The full application config stored at %APPDATA%/cc-assist/config.json
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProfilesStore {
    pub active_profile_id: String,
    pub profiles: Vec<ProfileConfig>,
    /// Built-in providers, populated from built_in_providers() on every load.
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
    #[serde(default)]
    pub recent_directories: RecentDirectories,
    #[serde(default = "default_locale")]
    pub locale: String,
}

fn default_locale() -> String {
    "en".to_string()
}

/// App-wide errors.
#[allow(dead_code)]
#[derive(Debug)]
pub enum AppError {
    IoError(std::io::Error),
    ConfigParseError(serde_json::Error),
    ProfileNotFound(String),
    ClaudeNotOnPath,
    SettingsNotFound,
    SettingsReadError(String),
    LaunchFailed(String),
    WindowError(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::IoError(e)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::ConfigParseError(e)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::IoError(e) => write!(f, "IO error: {}", e),
            AppError::ConfigParseError(e) => write!(f, "Config parse error: {}", e),
            AppError::ProfileNotFound(id) => write!(f, "Profile not found: {}", id),
            AppError::ClaudeNotOnPath => write!(f, "Claude CLI not found on PATH"),
            AppError::SettingsNotFound => write!(f, "Claude has not been configured yet (settings.json not found)"),
            AppError::SettingsReadError(msg) => write!(f, "Failed to read settings: {}", msg),
            AppError::LaunchFailed(msg) => write!(f, "Launch failed: {}", msg),
            AppError::WindowError(msg) => write!(f, "Window error: {}", msg),
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
