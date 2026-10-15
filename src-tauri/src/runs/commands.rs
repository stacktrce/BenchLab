use super::execute::execute_suite;
use super::model::{RunDetail, RunRecord};
use super::series::{self, CasePoint};
use super::store;
use crate::db::{Db, now_iso};
use crate::hyperfine::{self, RunControl};
use crate::logs::LogChunk;
use crate::suites::load_suite;
use tauri::State;

/// Runs the saved suite. The frontend must have shown the user every command first.
#[tauri::command]
pub async fn run_suite(
    db: State<'_, Db>,
    control: State<'_, RunControl>,
    suite_id: String,
) -> Result<RunDetail, String> {
    let suite = db.with(|c| load_suite(c, &suite_id))?;
    if !suite.cases.iter().any(|c| c.enabled) {
        return Err("No enabled cases to run.".to_string());
    }
    let hyperfine_path = hyperfine::locate_hyperfine()?;
    let started_at = db.with(now_iso)?;
    let active = control.begin()?;
    let cancel = active.flag();

    let (suite, tool_version, outcome) = tauri::async_runtime::spawn_blocking(move || {
        let version = hyperfine::tool_version(&hyperfine_path);
        let outcome = execute_suite(&hyperfine_path, &suite, &cancel);
        (suite, version, outcome)
    })
    .await
    .map_err(|e| format!("Suite run failed: {e}"))?;

    db.with(|c| store::insert_run(c, &suite, &started_at, &tool_version, &outcome))
}

#[tauri::command]
pub fn list_runs(
    db: State<'_, Db>,
    suite_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<RunRecord>, String> {
    db.with(|c| store::list_runs(c, suite_id.as_deref(), limit.unwrap_or(50)))
}

#[tauri::command]
pub fn get_run(db: State<'_, Db>, id: String) -> Result<RunDetail, String> {
    db.with(|c| store::get_run(c, &id))
}

/// The run's per-case logs, in the order the cases ran; empty for runs from before logs existed.
#[tauri::command]
pub fn get_run_logs(db: State<'_, Db>, id: String) -> Result<Vec<LogChunk>, String> {
    db.with(|c| crate::logs::run_logs(c, &id))
}

#[tauri::command]
pub fn case_series(
    db: State<'_, Db>,
    suite_id: String,
    case_name: String,
    limit: Option<i64>,
) -> Result<Vec<CasePoint>, String> {
    db.with(|c| series::case_series(c, &suite_id, &case_name, limit.unwrap_or(500)))
}

#[tauri::command]
pub fn case_names(db: State<'_, Db>, suite_id: String) -> Result<Vec<String>, String> {
    db.with(|c| series::case_names(c, &suite_id))
}
