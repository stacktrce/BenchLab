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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
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
            runs::commands::list_runs,
            runs::commands::get_run,
            runs::commands::get_run_logs,
            runs::commands::suite_run_durations,
            runs::commands::case_series,
            runs::commands::case_names,
            demo::load_demo,
            files::write_text_file,
            files::write_binary_file,
            files::write_xlsx_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
