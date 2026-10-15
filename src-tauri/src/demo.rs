//! Sample data so the app can be explored without hyperfine or real commands.
//! Commands are placeholders; the numbers are synthetic and deterministic.

use crate::db::{Db, sql_err};
use crate::git::GitInfo;
use crate::runs::SuiteOutcome;
use crate::suites::{Case, Suite, save_suite, set_baseline};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use tauri::State;

pub const DEMO_SUITE_NAME: &str = "Demo: string building (sample data)";

struct Spec {
    name: &'static str,
    mean_ms: f64,
    /// Relative spread (stddev / mean).
    noise: f64,
    runs: usize,
    /// Multiplier applied to the first timed run, to simulate a cold cache.
    cold_first: f64,
}

/// xorshift: deterministic pseudo-noise in [-1, 1].
fn noise(state: &mut u64) -> f64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    (*state % 20_001) as f64 / 10_000.0 - 1.0
}

fn result_for(spec: &Spec, seed: u64) -> Value {
    let mut state = seed | 1;
    let mean_s = spec.mean_ms / 1000.0;
    let mut times: Vec<f64> = (0..spec.runs)
        .map(|_| (mean_s * (1.0 + spec.noise * noise(&mut state) * 1.7)).max(1e-6))
        .collect();
    if let Some(first) = times.first_mut() {
        *first *= spec.cold_first;
    }
    let n = times.len() as f64;
    let mean = times.iter().sum::<f64>() / n;
    let stddev = (times.iter().map(|t| (t - mean).powi(2)).sum::<f64>() / (n - 1.0)).sqrt();
    let mut sorted = times.clone();
    sorted.sort_by(f64::total_cmp);
    let median = sorted[sorted.len() / 2];
    json!({
        "command": spec.name,
        "mean": mean,
        "stddev": stddev,
        "median": median,
        "user": mean * 0.8,
        "system": mean * 0.1,
        "min": sorted[0],
        "max": sorted[sorted.len() - 1],
        "times": times,
        "exit_codes": vec![0; times.len()],
    })
}

fn outcome(specs: &[Spec], seed: u64, git: GitInfo) -> SuiteOutcome {
    SuiteOutcome {
        results: specs
            .iter()
            .enumerate()
            .map(|(i, s)| result_for(s, seed + i as u64 * 7919))
            .collect(),
        errors: Vec::new(),
        case_count: specs.len() as i64,
        git: vec![git],
    }
}

fn sample_git(commit: &str, branch: &str, changed_files: usize) -> GitInfo {
    GitInfo {
        dir: "~/code/strings".into(),
        root: "~/code/strings".into(),
        commit: commit.into(),
        short_commit: commit.chars().take(7).collect(),
        branch: Some(branch.into()),
        dirty: changed_files > 0,
        changed_files,
    }
}

fn insert_demo_run(
    conn: &Connection,
    suite: &Suite,
    age: &str,
    o: &SuiteOutcome,
) -> Result<String, String> {
    let started: String = conn
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now', ?1)",
            [age],
            |r| r.get(0),
        )
        .map_err(sql_err)?;
    let finished: String = conn
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?1, '+23 seconds')",
            [&started],
            |r| r.get(0),
        )
        .map_err(sql_err)?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status,
                           tool_version, case_count, error, raw_output, config_json, git_json)
         VALUES (?1, ?2, ?3, ?4, ?5, 'completed', 'hyperfine 1.20.0 (sample)', ?6, NULL, ?7, ?8, ?9)",
        params![
            id,
            suite.id,
            suite.name,
            started,
            finished,
            o.case_count,
            o.raw_output(),
            serde_json::to_string(suite).map_err(|e| e.to_string())?,
            serde_json::to_string(&o.git).map_err(|e| e.to_string())?
        ],
    )
    .map_err(sql_err)?;
    if let Some(raw) = o.raw_output() {
        crate::runs::index_run(conn, &id, &raw)?;
    }
    Ok(id)
}

/// Creates the demo suite and two runs. Returns the suite id; reuses an existing demo suite.
pub fn ensure_demo_suite(conn: &Connection) -> Result<String, String> {
    if let Ok(id) = conn.query_row(
        "SELECT id FROM suites WHERE name = ?1",
        [DEMO_SUITE_NAME],
        |r| r.get::<_, String>(0),
    ) {
        return Ok(id);
    }
    let case = |name: &str, command: &str, budget_percent: Option<f64>| Case {
        id: String::new(),
        name: name.into(),
        command: command.into(),
        setup_command: None,
        cleanup_command: None,
        working_directory: None,
        enabled: true,
        budget_percent,
    };
    let suite = save_suite(
        conn,
        Suite {
            id: String::new(),
            name: DEMO_SUITE_NAME.into(),
            description: "Sample data. The commands are placeholders; edit them before running."
                .into(),
            runs: 10,
            warmup: 1,
            baseline_run_id: None,
            schema_version: 0,
            created_at: String::new(),
            updated_at: String::new(),
            cases: vec![
                case("concat with +=", "node bench/concat.js", Some(5.0)),
                case("array join", "node bench/join.js", None),
                case("template literal", "node bench/template.js", Some(10.0)),
                case("regex split", "node bench/split.js", Some(20.0)),
            ],
        },
    )?;

    let baseline = [
        Spec {
            name: "concat with +=",
            mean_ms: 42.0,
            noise: 0.03,
            runs: 10,
            cold_first: 1.0,
        },
        Spec {
            name: "array join",
            mean_ms: 31.0,
            noise: 0.04,
            runs: 10,
            cold_first: 1.0,
        },
        Spec {
            name: "template literal",
            mean_ms: 28.0,
            noise: 0.03,
            runs: 10,
            cold_first: 1.0,
        },
        Spec {
            name: "regex split",
            mean_ms: 55.0,
            noise: 0.05,
            runs: 10,
            cold_first: 3.2,
        },
    ];
    let candidate = [
        Spec {
            name: "concat with +=",
            mean_ms: 41.5,
            noise: 0.06,
            runs: 10,
            cold_first: 1.0,
        },
        Spec {
            name: "array join",
            mean_ms: 24.0,
            noise: 0.03,
            runs: 10,
            cold_first: 1.0,
        },
        Spec {
            name: "template literal",
            mean_ms: 36.0,
            noise: 0.04,
            runs: 10,
            cold_first: 1.0,
        },
        Spec {
            name: "regex split",
            mean_ms: 54.0,
            noise: 0.12,
            runs: 3,
            cold_first: 1.0,
        },
    ];
    let before = sample_git("9f2c1d47e0a3b58c6d1e2f4a7b9c0d3e5f6a8b1c", "main", 0);
    let after = sample_git("c71ab3e90d24f5a6b7c8d9e0f1a2b3c4d5e6f7a8", "perf/join", 2);
    let first = insert_demo_run(conn, &suite, "-1 day", &outcome(&baseline, 11, before))?;
    insert_demo_run(conn, &suite, "-2 hours", &outcome(&candidate, 97, after))?;
    set_baseline(conn, &suite.id, Some(&first))?;
    Ok(suite.id)
}

#[tauri::command]
pub fn load_demo(db: State<'_, Db>) -> Result<String, String> {
    db.with(ensure_demo_suite)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::memory;
    use crate::runs::list_runs;

    #[test]
    fn creates_suite_with_two_runs_once() {
        let conn = memory();
        let id = ensure_demo_suite(&conn).unwrap();
        assert_eq!(ensure_demo_suite(&conn).unwrap(), id);
        let runs = list_runs(&conn, Some(&id), 10).unwrap();
        assert_eq!(runs.len(), 2);
        assert!(runs[0].started_at > runs[1].started_at);
        assert!(runs.iter().all(|r| r.finished_at > r.started_at));
        // the older run is pinned as the baseline, so the sample shows the feature
        let suite = crate::suites::load_suite(&conn, &id).unwrap();
        assert_eq!(suite.baseline_run_id.as_deref(), Some(runs[1].id.as_str()));
    }

    #[test]
    fn synthetic_results_are_valid_hyperfine_shape_and_deterministic() {
        let spec = Spec {
            name: "x",
            mean_ms: 10.0,
            noise: 0.05,
            runs: 8,
            cold_first: 3.0,
        };
        let (a, b) = (result_for(&spec, 5), result_for(&spec, 5));
        assert_eq!(a, b);
        assert_eq!(a["times"].as_array().unwrap().len(), 8);
        assert!(a["stddev"].as_f64().unwrap() > 0.0);
        assert!(a["max"].as_f64().unwrap() >= a["min"].as_f64().unwrap());
    }
}
