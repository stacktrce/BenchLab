//! Sample data so the app can be explored without running anything first. The two runs are
//! synthetic and deterministic; the commands are real, harmless and run in hyperfine's
//! default shell on each platform, so the suite can also be run as it is.

use crate::db::{Db, sql_err};
use crate::git::GitInfo;
use crate::runs::SuiteOutcome;
use crate::suites::{Case, Suite, save_suite, set_baseline};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use tauri::State;

pub const DEMO_SUITE_NAME: &str = "Demo: shell basics (sample data)";

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
        logs: Vec::new(),
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

/// Command per case for hyperfine's default shell: cmd.exe on Windows, sh elsewhere.
#[cfg(windows)]
const COMMANDS: [&str; 4] = [
    "echo hello",
    "dir /b",
    "for /L %i in (1,1,20000) do @rem",
    "cmd /c exit 0",
];
#[cfg(not(windows))]
const COMMANDS: [&str; 4] = [
    "echo hello",
    "ls",
    "i=0; while [ \"$i\" -lt 20000 ]; do i=$((i+1)); done",
    "sh -c true",
];

const BUDGET_PERCENT: [Option<f64>; 4] = [Some(5.0), None, Some(10.0), Some(20.0)];

/// Means are close to what these commands take on a Windows laptop, so a real run of the
/// suite lands near the sample instead of looking like a dramatic change.
const BASELINE: [Spec; 4] = [
    Spec {
        name: "echo",
        mean_ms: 2.3,
        noise: 0.03,
        runs: 10,
        cold_first: 1.0,
    },
    Spec {
        name: "list directory",
        mean_ms: 10.6,
        noise: 0.04,
        runs: 10,
        cold_first: 1.0,
    },
    Spec {
        name: "count to 20000",
        mean_ms: 7.2,
        noise: 0.03,
        runs: 10,
        cold_first: 1.0,
    },
    Spec {
        name: "start another shell",
        mean_ms: 60.0,
        noise: 0.05,
        runs: 10,
        cold_first: 3.2,
    },
];
const CANDIDATE: [Spec; 4] = [
    Spec {
        name: "echo",
        mean_ms: 2.28,
        noise: 0.06,
        runs: 10,
        cold_first: 1.0,
    },
    Spec {
        name: "list directory",
        mean_ms: 8.2,
        noise: 0.03,
        runs: 10,
        cold_first: 1.0,
    },
    Spec {
        name: "count to 20000",
        mean_ms: 9.3,
        noise: 0.04,
        runs: 10,
        cold_first: 1.0,
    },
    Spec {
        name: "start another shell",
        mean_ms: 59.0,
        noise: 0.12,
        runs: 3,
        cold_first: 1.0,
    },
];

fn demo_cases() -> Vec<Case> {
    BASELINE
        .iter()
        .zip(COMMANDS)
        .zip(BUDGET_PERCENT)
        .map(|((spec, command), budget_percent)| Case {
            id: String::new(),
            name: spec.name.into(),
            command: command.into(),
            setup_command: None,
            cleanup_command: None,
            working_directory: None,
            enabled: true,
            budget_percent,
        })
        .collect()
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
    let suite = save_suite(
        conn,
        Suite {
            id: String::new(),
            name: DEMO_SUITE_NAME.into(),
            description: "Sample data: the two runs are synthetic. The commands are real and harmless, so you can run the suite as it is.".into(),
            runs: 10,
            warmup: 1,
            baseline_run_id: None,
            schema_version: 0,
            created_at: String::new(),
            updated_at: String::new(),
            cases: demo_cases(),
        },
    )?;

    let before = sample_git("9f2c1d47e0a3b58c6d1e2f4a7b9c0d3e5f6a8b1c", "main", 0);
    let after = sample_git("c71ab3e90d24f5a6b7c8d9e0f1a2b3c4d5e6f7a8", "perf/join", 2);
    let first = insert_demo_run(conn, &suite, "-1 day", &outcome(&BASELINE, 11, before))?;
    insert_demo_run(conn, &suite, "-2 hours", &outcome(&CANDIDATE, 97, after))?;
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

    #[test]
    fn every_case_has_synthetic_results_under_the_same_name() {
        let conn = memory();
        let id = ensure_demo_suite(&conn).unwrap();
        let suite = crate::suites::load_suite(&conn, &id).unwrap();
        let names: Vec<_> = suite.cases.iter().map(|c| c.name.as_str()).collect();
        let synthetic: Vec<_> = BASELINE.iter().map(|s| s.name).collect();
        assert_eq!(names, synthetic);
        assert_eq!(names, CANDIDATE.iter().map(|s| s.name).collect::<Vec<_>>());
    }

    /// The sample suite must be runnable as it is: its commands used to be placeholders that
    /// failed with exit code 1.
    #[test]
    fn demo_commands_run_successfully_with_hyperfine() {
        let Some(hf) = crate::testing::real_hyperfine() else {
            return;
        };
        for case in demo_cases() {
            let job = crate::hyperfine::Job {
                name: Some(&case.name),
                command: &case.command,
                setup: None,
                cleanup: None,
                working_dir: None,
                runs: Some(2),
                warmup: Some(0),
                timeout: std::time::Duration::from_secs(60),
                cancel: None,
                show_output: false,
            };
            let out = crate::hyperfine::exec(&hf, &job).unwrap();
            assert_eq!(out.exit_code, Some(0), "{}: {}", case.name, out.stderr);
        }
    }
}
