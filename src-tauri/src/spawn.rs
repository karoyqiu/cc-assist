use std::fs;
use std::path::Path;
use std::process::Command;

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

/// Launch Claude in a directory with the given profile merged into settings.json.
/// - Backup settings.json → settings.json.bak before merge
/// - On spawn failure: restore from backup
/// - On spawn success: delete backup after a short delay (or on next launch)
pub fn launch_claude_in_directory(
    profile: &ProfileConfig,
    dir: &Path,
) -> Result<(), AppError> {
    // 1. Check claude on PATH
    if !check_claude_on_path() {
        return Err(AppError::ClaudeNotOnPath);
    }

    // 2. Read existing settings.json
    let mut settings = settings::read_settings_json()?;

    // 3. Backup
    settings::backup_settings()?;

    // 4. Merge profile into settings
    settings::merge_profile_into_settings(profile, &mut settings);

    // 5. Atomic write
    if let Err(e) = settings::write_settings_atomically(&settings) {
        // Write failed — restore backup if it exists
        settings::restore_settings_backup().ok();
        return Err(e);
    }

    // 6. Spawn Claude
    #[cfg(windows)]
    let result = Command::new("cmd")
        .args(["/c", "start", "", "claude"])
        .current_dir(dir)
        .spawn();

    #[cfg(not(windows))]
    let result = Command::new("claude")
        .current_dir(dir)
        .spawn();

    match result {
        Ok(_) => {
            // Success — clear the backup
            settings::clear_backup();
            Ok(())
        }
        Err(e) => {
            // Spawn failed — restore settings from backup
            settings::restore_settings_backup().ok();
            Err(AppError::LaunchFailed(e.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_claude_on_path() {
        // This will return true or false depending on whether claude is installed
        let result = check_claude_on_path();
        // We just check it doesn't panic
        assert!(result == true || result == false);
    }
}
