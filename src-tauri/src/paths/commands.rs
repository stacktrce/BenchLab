use super::{DATABASE_FILE, LOG_FILE};
use tauri::Manager;

/// Where BenchLab keeps its files, for the Settings page.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub database: String,
    pub log: String,
}

#[tauri::command]
pub fn app_paths(app: tauri::AppHandle) -> Result<AppPaths, String> {
    let paths = app.path();
    let data = paths.app_data_dir().map_err(|e| e.to_string())?;
    let logs = paths.app_log_dir().map_err(|e| e.to_string())?;
    Ok(AppPaths {
        database: data.join(DATABASE_FILE).display().to_string(),
        log: logs.join(format!("{LOG_FILE}.log")).display().to_string(),
    })
}
