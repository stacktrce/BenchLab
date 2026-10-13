mod db;
mod demo;
mod files;
mod git;
mod hyperfine;
mod runs;
mod suites;
#[cfg(test)]
mod testing;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let conn = db::open(&dir.join("benchlab.db"))?;
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
            demo::load_demo,
            files::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
