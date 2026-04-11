use std::sync::Mutex;
use std::path::PathBuf;

use crate::types::ProfilesStore;

pub struct AppState {
    pub store: Mutex<ProfilesStore>,
    pub app_data_dir: Mutex<PathBuf>,
}
