use std::collections::HashMap;
use std::path::Path;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AllowlistEntry {
    pub command: String,
    pub approved_count: u32,
    #[serde(with = "time::serde::rfc3339")]
    pub last_approved_at: OffsetDateTime,
}

#[derive(Default, Debug, Serialize, Deserialize)]
pub struct PermissionAllowlist {
    pub entries: HashMap<String, AllowlistEntry>,
}

impl PermissionAllowlist {
    pub fn load(app_data_dir: &Path) -> Self {
        let path = app_data_dir.join("permission_allowlist.json");
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, app_data_dir: &Path) -> Result<(), String> {
        let path = app_data_dir.join("permission_allowlist.json");
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| e.to_string())
    }

    pub fn allow(&mut self, command: &str) {
        let entry = self.entries.entry(command.to_string()).or_insert_with(|| AllowlistEntry {
            command: command.to_string(),
            approved_count: 0,
            last_approved_at: OffsetDateTime::now_utc(),
        });
        entry.approved_count += 1;
        entry.last_approved_at = OffsetDateTime::now_utc();
    }

    pub fn remove(&mut self, commands: &[String]) {
        for cmd in commands {
            self.entries.remove(cmd);
        }
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    pub fn should_auto_approve(&self, raw_command: &str, session_cwd: &Path) -> bool {
        let resolved = resolve_command(raw_command, session_cwd);
        let cmd = resolved.split_whitespace().next().unwrap_or(resolved);
        self.entries.contains_key(cmd)
    }

    pub fn entries_sorted(&self) -> Vec<&AllowlistEntry> {
        let mut v: Vec<_> = self.entries.values().collect();
        v.sort_by(|a, b| b.last_approved_at.cmp(&a.last_approved_at));
        v
    }
}

/// Strip a leading `cd <dir> &&` or `cd <dir>;` prefix if the target matches session_cwd.
pub fn resolve_command<'a>(raw: &'a str, session_cwd: &Path) -> &'a str {
    let trimmed = raw.trim();
    if let Some(rest) = trimmed.strip_prefix("cd ") &&
        let Some((cd_target, rest_cmd)) = rest.split_once(" && ").or_else(|| rest.split_once("; "))
    {
        let cd_path = Path::new(cd_target.trim());
        let canonical_target =
            std::fs::canonicalize(cd_path).unwrap_or_else(|_| cd_path.to_path_buf());
        let canonical_cwd =
            std::fs::canonicalize(session_cwd).unwrap_or_else(|_| session_cwd.to_path_buf());
        if canonical_target == canonical_cwd {
            return rest_cmd.trim();
        }
    }
    trimmed
}
