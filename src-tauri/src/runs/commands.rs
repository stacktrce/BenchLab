use super::diagnose::{DiagnoseResult, diagnose};
use super::events::{RunEvent, RunSink, TauriSink};
use super::execute::execute_suite;
use super::history::{self, HistoryRow, Page, RunFilter};
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
    app: tauri::AppHandle,
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

    log::info!(
        "Running suite \"{}\": {} enabled case(s), {} run(s) each",
        suite.name,
        suite.cases.iter().filter(|c| c.enabled).count(),
        suite.runs
    );
    // Kept outside the task: the frontend must hear "finished" even if the task itself fails,
    // or its progress display would stay up.
    let finisher = TauriSink(app.clone());
    let sink = TauriSink(app);
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let version = hyperfine::tool_version(&hyperfine_path);
        let outcome = execute_suite(&hyperfine_path, &suite, &cancel, &sink);
        (suite, version, outcome)
    })
    .await;
    let (suite, tool_version, outcome) = match joined {
        Ok(done) => done,
        Err(e) => {
            log::error!("Suite run failed: {e}");
            finisher.emit(RunEvent::Finished {
                run_id: None,
                status: "failed".into(),
            });
            return Err(format!("Suite run failed: {e}"));
        }
    };

    let stored = db.with(|c| store::insert_run(c, &suite, &started_at, &tool_version, &outcome));
    for error in &outcome.errors {
        log::warn!("Suite \"{}\": {error}", suite.name);
    }
    match &stored {
        Ok(run) => log::info!(
            "Suite \"{}\" finished: {}, run {}",
            suite.name,
            outcome.status(),
            run.record.id
        ),
        Err(e) => log::error!("Suite \"{}\" ran but could not be stored: {e}", suite.name),
    }
    finisher.emit(RunEvent::Finished {
        run_id: stored.as_ref().ok().map(|r| r.record.id.clone()),
        status: outcome.status().to_string(),
    });
    stored
}

/// Runs one case of the saved suite once, untimed, and returns what it printed. Not recorded as
/// a run. The frontend must have shown the user the case's commands first.
#[tauri::command]
pub async fn diagnose_case(
    db: State<'_, Db>,
    control: State<'_, RunControl>,
    suite_id: String,
    case_name: String,
) -> Result<DiagnoseResult, String> {
    let suite = db.with(|c| load_suite(c, &suite_id))?;
    let case = suite
        .cases
        .into_iter()
        .find(|c| c.name == case_name)
        .ok_or_else(|| format!("The suite no longer has a case called \"{case_name}\"."))?;
    let hyperfine_path = hyperfine::locate_hyperfine()?;
    let active = control.begin()?;
    let cancel = active.flag();
    log::info!("Diagnosing case \"{}\" of \"{}\"", case.name, suite.name);
    tauri::async_runtime::spawn_blocking(move || diagnose(&hyperfine_path, &case, &cancel))
        .await
        .map_err(|e| format!("Diagnosis failed: {e}"))
}

/// Runs across suites matching `filter`, newest first, one page at a time.
#[tauri::command]
pub fn search_runs(
    db: State<'_, Db>,
    filter: RunFilter,
    limit: i64,
    offset: i64,
) -> Result<Page<HistoryRow>, String> {
    db.with(|c| history::search_runs(c, &filter, limit, offset))
}

#[tauri::command]
pub fn set_run_meta(
    db: State<'_, Db>,
    id: String,
    note: Option<String>,
    tags: Vec<String>,
) -> Result<RunRecord, String> {
    db.with(|c| history::set_run_meta(c, &id, note.as_deref(), &tags))
}

/// Deletes runs for good. The frontend asks for confirmation first, naming how many.
#[tauri::command]
pub fn delete_runs(db: State<'_, Db>, ids: Vec<String>) -> Result<usize, String> {
    let deleted = db.with(|c| history::delete_runs(c, &ids))?;
    log::info!("Deleted {deleted} run(s)");
    Ok(deleted)
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

/// Seconds taken by the suite's last completed runs, newest first, for estimating time left.
#[tauri::command]
pub fn suite_run_durations(
    db: State<'_, Db>,
    suite_id: String,
    limit: Option<i64>,
) -> Result<Vec<f64>, String> {
    db.with(|c| store::run_durations(c, &suite_id, limit.unwrap_or(3)))
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
