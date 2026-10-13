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
            suites::commands::list_suites_cmd,
            suites::commands::get_suite,
            suites::commands::save_suite_cmd,
            suites::commands::duplicate_suite_cmd,
            suites::commands::delete_suite_cmd,
            suites::commands::set_baseline_cmd,
            runs::run_suite,
            runs::list_runs_cmd,
            runs::get_run_cmd,
            demo::load_demo_cmd,
            files::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
