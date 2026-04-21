//! Permission allowlist — command names that auto-approve.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use time::OffsetDateTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllowlistEntry {
    pub command: String,
    pub approved_at: String,
    pub approved_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Allowlist {
    pub entries: Vec<AllowlistEntry>,
}

impl Allowlist {
    pub fn load(path: &PathBuf) -> Self {
        if !path.exists() {
            return Self::default();
        }
        serde_json::from_str(&fs::read_to_string(path).unwrap_or_default()).unwrap_or_default()
    }

    pub fn save(&self, path: &PathBuf) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    /// Check if a command should auto-approve (command family match).
    pub fn should_auto_approve(&self, cmd: &str) -> bool {
        let command = cmd.split_whitespace().next().unwrap_or(cmd);
        self.entries.iter().any(|e| e.command == command)
    }

    pub fn add_approval(&mut self, cmd: &str) {
        let command = cmd.split_whitespace().next().unwrap_or(cmd).to_string();
        if let Some(entry) = self.entries.iter_mut().find(|e| e.command == command) {
            entry.approved_count += 1;
            entry.approved_at = OffsetDateTime::now_utc().to_string();
        } else {
            self.entries.push(AllowlistEntry {
                command,
                approved_at: OffsetDateTime::now_utc().to_string(),
                approved_count: 1,
            });
        }
    }

    pub fn remove(&mut self, command: &str) {
        self.entries.retain(|e| e.command != command);
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }
}
