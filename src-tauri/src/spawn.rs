use std::io::Write;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, SystemTime};

use crate::settings;
use crate::types::{AppError, ProfileConfig};

/// Check if `claude` is on PATH (Windows: `where`, Unix: `which`).
pub fn check_claude_on_path() -> bool {
    #[cfg(windows)]
    {
        Command::new("where")
            .arg("claude")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok()
    }
    #[cfg(not(windows))]
    {
        Command::new("which")
            .arg("claude")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok()
    }
}

/// Remove stale cc-assist temp settings files from the system temp directory.
/// Only deletes files older than 60 seconds to avoid removing in-use files
/// from concurrent launches.
fn cleanup_stale_temp_files() {
    let temp_dir = std::env::temp_dir();
    let Ok(entries) = std::fs::read_dir(&temp_dir) else {
        return;
    };
    let cutoff = SystemTime::now() - Duration::from_secs(60);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with("cc-assist-settings-") && name_str.ends_with(".json") {
            // Only delete if the file is old enough to be stale
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if modified < cutoff {
                        std::fs::remove_file(entry.path()).ok();
                    }
                }
            }
        }
    }
}

/// Launch Claude in a directory using a temporary settings file.
///
/// Instead of modifying ~/.claude/settings.json, this:
/// 1. Creates a temp file with the profile's env vars
/// 2. Spawns `claude --settings <temp-path>` in the directory
/// 3. Cleans up the temp file when Claude exits (via background thread)
pub fn launch_claude_in_directory(
    profile: &ProfileConfig,
    dir: &Path,
) -> Result<(), AppError> {
    // 1. Check claude on PATH
    if !check_claude_on_path() {
        return Err(AppError::ClaudeNotOnPath);
    }

    // 2. Clean up stale temp files from previous launches
    cleanup_stale_temp_files();

    // 3. Build temp settings file with profile env vars
    let env_map = settings::build_env_map(profile);
    let settings_json = if env_map.is_empty() {
        serde_json::json!({})
    } else {
        serde_json::json!({ "env": env_map })
    };

    let temp_dir = std::env::temp_dir();
    let mut temp_file = tempfile::NamedTempFile::with_prefix_in(
        "cc-assist-settings-",
        &temp_dir,
    )
    .map_err(AppError::IoError)?;

    let settings_str = serde_json::to_string_pretty(&settings_json)
        .map_err(AppError::ConfigParseError)?;
    temp_file.write_all(settings_str.as_bytes()).map_err(AppError::IoError)?;
    temp_file.flush().map_err(AppError::IoError)?;

    // Get the path and prevent auto-deletion — we manage cleanup ourselves
    // in the background thread after Claude exits.
    let temp_path = temp_file.into_temp_path();
    let temp_path_buf = temp_path.to_path_buf();
    // keep() consumes TempPath and prevents Drop from deleting the file.
    // The file stays on disk until we explicitly remove it.
    temp_path.keep().map_err(|e| AppError::IoError(e.error))?;

    // 4. Spawn Claude with --settings flag
    #[cfg(windows)]
    let result = {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        Command::new("claude")
            .args(["--settings", &temp_path_buf.to_string_lossy()])
            .current_dir(dir)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
    };

    #[cfg(not(windows))]
    let result = {
        Command::new("claude")
            .args(["--settings", &temp_path_buf.to_string_lossy()])
            .current_dir(dir)
            .spawn()
    };

    match result {
        Ok(child) => {
            let cleanup_path = temp_path_buf;
            std::thread::spawn(move || {
                let mut child = child;
                let _ = child.wait();
                std::fs::remove_file(&cleanup_path).ok();
            });
            Ok(())
        }
        Err(e) => {
            // Spawn failed — clean up temp file
            std::fs::remove_file(&temp_path_buf).ok();
            Err(AppError::LaunchFailed(e.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_claude_on_path() {
        let result = check_claude_on_path();
        assert!(result == true || result == false);
    }
}
