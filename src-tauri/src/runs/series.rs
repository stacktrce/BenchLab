use crate::db::sql_err;
use rusqlite::{Connection, params};
use serde::Serialize;

/// One case's result in one run, with the code state that run measured.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CasePoint {
    pub run_id: String,
    pub started_at: String,
    pub status: String,
    pub commit: Option<String>,
    pub short_commit: Option<String>,
    pub branch: Option<String>,
    pub dirty: bool,
    pub mean: f64,
    pub stddev: Option<f64>,
    pub median: f64,
    pub min: f64,
    pub max: f64,
    pub samples: i64,
}

/// Copies each case's summary numbers out of a run's merged hyperfine JSON into `run_cases`, so a
/// case's history can be read without parsing every stored run. A result missing a required
/// number is skipped rather than failing the run. Returns how many rows were written.
pub fn index_run(conn: &Connection, run_id: &str, raw_output: &str) -> Result<usize, String> {
    let value: serde_json::Value = serde_json::from_str(raw_output)
        .map_err(|e| format!("Stored run output is not valid JSON: {e}"))?;
    let results = value
        .get("results")
        .and_then(|r| r.as_array())
        .ok_or("Stored run output has no results")?;
    let mut insert = conn
        .prepare(
            "INSERT OR REPLACE INTO run_cases
                 (run_id, case_name, mean, stddev, median, min, max, samples)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .map_err(sql_err)?;
    let mut written = 0;
    for r in results {
        let (Some(name), Some(mean), Some(median), Some(min), Some(max)) = (
            r["command"].as_str(),
            r["mean"].as_f64(),
            r["median"].as_f64(),
            r["min"].as_f64(),
            r["max"].as_f64(),
        ) else {
            continue;
        };
        let samples = r["times"]
            .as_array()
            .or_else(|| r["exit_codes"].as_array())
            .map_or(0, Vec::len) as i64;
        insert
            .execute(params![
                run_id,
                name,
                mean,
                r["stddev"].as_f64(),
                median,
                min,
                max,
                samples
            ])
            .map_err(sql_err)?;
        written += 1;
    }
    Ok(written)
}

/// Indexes every run that has results but no rows yet. Safe to call on every start.
pub fn backfill_run_cases(conn: &Connection) -> Result<usize, String> {
    let pending: Vec<(String, String)> = conn
        .prepare(
            "SELECT id, raw_output FROM runs
             WHERE raw_output IS NOT NULL
               AND id NOT IN (SELECT DISTINCT run_id FROM run_cases)",
        )
        .map_err(sql_err)?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(sql_err)?
        .collect::<Result<_, _>>()
        .map_err(sql_err)?;
    let tx = conn.unchecked_transaction().map_err(sql_err)?;
    let mut total = 0;
    for (id, raw) in pending {
        total += index_run(&tx, &id, &raw)?;
    }
    tx.commit().map_err(sql_err)?;
    Ok(total)
}

/// The newest `limit` non-failed runs of `suite_id` that include `case_name`, oldest first. A run
/// that lacks the case contributes nothing, so a renamed or removed case shows a gap.
pub(super) fn case_series(
    conn: &Connection,
    suite_id: &str,
    case_name: &str,
    limit: i64,
) -> Result<Vec<CasePoint>, String> {
    let mut points: Vec<CasePoint> = conn
        .prepare(
            "SELECT r.id, r.started_at, r.status,
                    json_extract(r.git_json, '$[0].commit'),
                    json_extract(r.git_json, '$[0].shortCommit'),
                    json_extract(r.git_json, '$[0].branch'),
                    COALESCE(json_extract(r.git_json, '$[0].dirty'), 0),
                    c.mean, c.stddev, c.median, c.min, c.max, c.samples
             FROM run_cases c JOIN runs r ON r.id = c.run_id
             WHERE r.suite_id = ?1 AND c.case_name = ?2 AND r.status != 'failed'
             ORDER BY r.started_at DESC
             LIMIT ?3",
        )
        .map_err(sql_err)?
        .query_map(params![suite_id, case_name, limit.clamp(1, 5000)], |r| {
            Ok(CasePoint {
                run_id: r.get(0)?,
                started_at: r.get(1)?,
                status: r.get(2)?,
                commit: r.get(3)?,
                short_commit: r.get(4)?,
                branch: r.get(5)?,
                dirty: r.get::<_, i64>(6)? != 0,
                mean: r.get(7)?,
                stddev: r.get(8)?,
                median: r.get(9)?,
                min: r.get(10)?,
                max: r.get(11)?,
                samples: r.get(12)?,
            })
        })
        .map_err(sql_err)?
        .collect::<Result<_, _>>()
        .map_err(sql_err)?;
    points.reverse();
    Ok(points)
}

/// Every case name that appears in any run of the suite, sorted.
pub(super) fn case_names(conn: &Connection, suite_id: &str) -> Result<Vec<String>, String> {
    conn.prepare(
        "SELECT DISTINCT c.case_name FROM run_cases c JOIN runs r ON r.id = c.run_id
         WHERE r.suite_id = ?1 ORDER BY c.case_name",
    )
    .map_err(sql_err)?
    .query_map([suite_id], |r| r.get(0))
    .map_err(sql_err)?
    .collect::<Result<_, _>>()
    .map_err(sql_err)
}

#[cfg(test)]
mod tests;
