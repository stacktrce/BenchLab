use super::model::{Suite, SuiteSummary};
use super::store;
use crate::db::Db;
use tauri::State;

#[tauri::command]
pub fn list_suites(db: State<'_, Db>) -> Result<Vec<SuiteSummary>, String> {
    db.with(store::list_suites)
}

#[tauri::command]
pub fn get_suite(db: State<'_, Db>, id: String) -> Result<Suite, String> {
    db.with(|c| store::load_suite(c, &id))
}

#[tauri::command]
pub fn save_suite(db: State<'_, Db>, suite: Suite) -> Result<Suite, String> {
    db.with(|c| store::save_suite(c, suite))
}

#[tauri::command]
pub fn duplicate_suite(db: State<'_, Db>, id: String) -> Result<Suite, String> {
    db.with(|c| store::duplicate_suite(c, &id))
}

#[tauri::command]
pub fn set_baseline(
    db: State<'_, Db>,
    suite_id: String,
    run_id: Option<String>,
) -> Result<Suite, String> {
    db.with(|c| store::set_baseline(c, &suite_id, run_id.as_deref()))
}

#[tauri::command]
pub fn delete_suite(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.with(|c| store::delete_suite(c, &id))
}
