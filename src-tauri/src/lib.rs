mod console;
mod db;
mod demo;
mod files;
mod git;
mod hyperfine;
mod logs;
mod runs;
mod suites;
#[cfg(test)]
mod testing;

use std::path::Path;
use tauri::Manager;

/// Debug builds keep their own database, so running `tauri dev` on a newer schema never
/// upgrades the data of an installed build (which would then refuse to start).
const DATABASE_FILE: &str = if cfg!(debug_assertions) {
    "benchlab-dev.db"
} else {
    "benchlab.db"
};

/// The app's own log, in the platform's log folder (on Windows
/// `%LOCALAPPDATA%\com.benchlab.main\logs`). Debug builds write their own file, as with the database.
const LOG_FILE: &str = if cfg!(debug_assertions) {
    "benchlab-dev"
} else {
    "benchlab"
};
const LOG_MAX_BYTES: u128 = 1_000_000;

fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
    let mut targets = vec![Target::new(TargetKind::LogDir {
        file_name: Some(LOG_FILE.into()),
    })];
    if cfg!(debug_assertions) {
        targets.push(Target::new(TargetKind::Stdout));
    }
    tauri_plugin_log::Builder::new()
        .targets(targets)
        .level(log::LevelFilter::Info)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .max_file_size(LOG_MAX_BYTES)
        .rotation_strategy(RotationStrategy::KeepOne)
        .build()
}

fn open_database(dir: &Path) -> Result<rusqlite::Connection, String> {
    let path = dir.join(DATABASE_FILE);
    let conn = db::open(&path).map_err(|e| {
        format!(
            "{e}

Database: {}",
            path.display()
        )
    })?;
    runs::backfill_run_cases(&conn)?;
    Ok(conn)
}

/// The window never opened and release builds abort on panic without output, so the reason
/// has to be shown in a native dialog or the app just seems to vanish.
fn exit_with_startup_error(message: &str) -> ! {
    log::error!("BenchLab could not start: {message}");
    eprintln!("BenchLab could not start: {message}");
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("BenchLab could not start")
        .set_description(message)
        .show();
    std::process::exit(1);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, so everything after it, including a failed start, is logged.
        .plugin(log_plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            log::info!(
                "BenchLab {} starting, database {}",
                app.package_info().version,
                dir.join(DATABASE_FILE).display()
            );
            let conn = open_database(&dir).unwrap_or_else(|e| exit_with_startup_error(&e));
            app.manage(db::Db::new(conn));
            app.manage(hyperfine::RunControl::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hyperfine::commands::find_hyperfine,
            hyperfine::commands::run_benchmark,
            hyperfine::commands::cancel_run,
            suites::commands::list_suites,
            suites::commands::get_suite,
            suites::commands::save_suite,
            suites::commands::duplicate_suite,
            suites::commands::delete_suite,
            suites::commands::set_baseline,
            runs::commands::run_suite,
            runs::commands::diagnose_case,
            runs::commands::list_runs,
            runs::commands::search_runs,
            runs::commands::set_run_meta,
            runs::commands::delete_runs,
            runs::commands::get_run,
            runs::commands::get_run_logs,
            runs::commands::suite_run_durations,
            runs::commands::case_series,
            runs::commands::case_names,
            demo::load_demo,
            files::write_text_file,
            files::write_binary_file,
            files::write_xlsx_file,
            app_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Where BenchLab keeps its files, for the Settings page.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppPaths {
    database: String,
    log: String,
}

#[tauri::command]
fn app_paths(app: tauri::AppHandle) -> Result<AppPaths, String> {
    let paths = app.path();
    let data = paths.app_data_dir().map_err(|e| e.to_string())?;
    let logs = paths.app_log_dir().map_err(|e| e.to_string())?;
    Ok(AppPaths {
        database: data.join(DATABASE_FILE).display().to_string(),
        log: logs.join(format!("{LOG_FILE}.log")).display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_builds_do_not_touch_the_installed_database() {
        assert_eq!(DATABASE_FILE, "benchlab-dev.db");
    }

    #[test]
    fn a_refused_database_names_its_file() {
        let dir = std::env::temp_dir().join(format!("benchlab-startup-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn = rusqlite::Connection::open(dir.join(DATABASE_FILE)).unwrap();
        conn.pragma_update(None, "user_version", 999i64).unwrap();
        drop(conn);
        let error = open_database(&dir).unwrap_err();
        assert!(error.contains("newer"), "{error}");
        assert!(error.contains(DATABASE_FILE), "{error}");
        let _ = std::fs::remove_dir_all(dir);
    }
}
