use super::model::{RunDetail, RunRecord, SuiteOutcome};
use super::series::index_run;
use crate::db::{now_iso, sql_err};
use crate::suites::Suite;
use rusqlite::{Connection, OptionalExtension, params};

pub(super) fn row_to_record(r: &rusqlite::Row) -> rusqlite::Result<RunRecord> {
    Ok(RunRecord {
        id: r.get(0)?,
        suite_id: r.get(1)?,
        suite_name: r.get(2)?,
        started_at: r.get(3)?,
        finished_at: r.get(4)?,
        status: r.get(5)?,
        tool_version: r.get(6)?,
        case_count: r.get(7)?,
        error: r.get(8)?,
        note: r.get(9)?,
        // Written only by set_run_meta as a JSON array; anything else reads as no tags.
        tags: serde_json::from_str(&r.get::<_, String>(10)?).unwrap_or_default(),
    })
}

/// Columns after RECORD_COLUMNS start at this index; queries that read more use it, so adding
/// a record column cannot shift what they read.
pub(super) const RECORD_COLUMN_COUNT: usize = 11;

pub(super) const RECORD_COLUMNS: &str = "id, suite_id, suite_name, started_at, finished_at, status,      tool_version, case_count, error, note, tags";

pub(super) fn insert_run(
    conn: &Connection,
    suite: &Suite,
    started_at: &str,
    tool_version: &str,
    outcome: &SuiteOutcome,
) -> Result<RunDetail, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let finished_at = now_iso(conn)?;
    let error = (!outcome.errors.is_empty()).then(|| outcome.errors.join("\n"));
    let raw = outcome.raw_output();
    let config = serde_json::to_string(suite).map_err(|e| format!("Cannot snapshot suite: {e}"))?;
    let git =
        serde_json::to_string(&outcome.git).map_err(|e| format!("Cannot store git state: {e}"))?;
    conn.execute(
        "INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status,
                           tool_version, case_count, error, raw_output, config_json, git_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            id,
            suite.id,
            suite.name,
            started_at,
            finished_at,
            outcome.status(),
            tool_version,
            outcome.case_count,
            error,
            raw,
            config,
            git
        ],
    )
    .map_err(sql_err)?;
    if let Some(raw) = &raw {
        // A run must never be lost because indexing failed; backfill_run_cases retries on the
        // next start.
        let _ = index_run(conn, &id, raw);
    }
    // Logs explain a run but are not the run: losing them must not lose the run.
    let _ = crate::logs::store_logs(conn, &id, &outcome.logs);
    get_run(conn, &id)
}

pub(super) fn get_run(conn: &Connection, id: &str) -> Result<RunDetail, String> {
    conn.query_row(
        &format!(
            "SELECT {RECORD_COLUMNS}, raw_output, config_json, git_json FROM runs WHERE id = ?1"
        ),
        [id],
        |r| {
            let config: Option<String> = r.get(RECORD_COLUMN_COUNT + 1)?;
            let git: Option<String> = r.get(RECORD_COLUMN_COUNT + 2)?;
            Ok(RunDetail {
                record: row_to_record(r)?,
                raw_output: r.get(RECORD_COLUMN_COUNT)?,
                config: config.and_then(|c| serde_json::from_str(&c).ok()),
                git: git
                    .and_then(|g| serde_json::from_str(&g).ok())
                    .unwrap_or_default(),
            })
        },
    )
    .optional()
    .map_err(sql_err)?
    .ok_or_else(|| "Run not found.".to_string())
}

/// How long the suite's completed runs took, in seconds, newest first.
pub fn run_durations(conn: &Connection, suite_id: &str, limit: i64) -> Result<Vec<f64>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT (julianday(finished_at) - julianday(started_at)) * 86400.0 FROM runs
             WHERE suite_id = ?1 AND status = 'completed'
             ORDER BY started_at DESC LIMIT ?2",
        )
        .map_err(sql_err)?;
    stmt.query_map(params![suite_id, limit.clamp(1, 100)], |r| r.get(0))
        .map_err(sql_err)?
        .collect::<Result<_, _>>()
        .map_err(sql_err)
}

pub fn list_runs(
    conn: &Connection,
    suite_id: Option<&str>,
    limit: i64,
) -> Result<Vec<RunRecord>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {RECORD_COLUMNS} FROM runs
             WHERE (?1 IS NULL OR suite_id = ?1)
             ORDER BY started_at DESC LIMIT ?2"
        ))
        .map_err(sql_err)?;
    let rows = stmt
        .query_map(params![suite_id, limit], row_to_record)
        .map_err(sql_err)?
        .collect::<Result<_, _>>()
        .map_err(sql_err)?;
    Ok(rows)
}

#[cfg(test)]
mod tests;
