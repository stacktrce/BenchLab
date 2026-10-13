use super::model::{Suite, SuiteSummary};
use super::store::{
    delete_suite, duplicate_suite, list_suites, load_suite, save_suite, set_baseline,
};
use crate::db::Db;
use tauri::State;

#[tauri::command]
pub fn list_suites_cmd(db: State<'_, Db>) -> Result<Vec<SuiteSummary>, String> {
    db.with(list_suites)
}

#[tauri::command]
pub fn get_suite(db: State<'_, Db>, id: String) -> Result<Suite, String> {
    db.with(|c| load_suite(c, &id))
}

#[tauri::command]
pub fn save_suite_cmd(db: State<'_, Db>, suite: Suite) -> Result<Suite, String> {
    db.with(|c| save_suite(c, suite))
}

#[tauri::command]
pub fn duplicate_suite_cmd(db: State<'_, Db>, id: String) -> Result<Suite, String> {
    db.with(|c| duplicate_suite(c, &id))
}

#[tauri::command]
pub fn set_baseline_cmd(
    db: State<'_, Db>,
    suite_id: String,
    run_id: Option<String>,
) -> Result<Suite, String> {
    db.with(|c| set_baseline(c, &suite_id, run_id.as_deref()))
}

#[tauri::command]
pub fn delete_suite_cmd(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.with(|c| delete_suite(c, &id))
}
