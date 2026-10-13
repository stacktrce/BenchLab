use crate::db::{Db, now_iso, sql_err};
use crate::git::{self, GitInfo};
use crate::hyperfine::{self, Job, RunControl};
use crate::suites::{Suite, load_suite};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::State;

/// Per-case limit for suite runs. Real benchmarks outlast the 30 s quick-run default.
const SUITE_CASE_TIMEOUT_SECS: u64 = 600;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
    pub id: String,
    pub suite_id: String,
    pub suite_name: String,
    pub started_at: String,
    pub finished_at: String,
    pub status: String,
    pub tool_version: String,
    pub case_count: i64,
    pub error: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunDetail {
    pub record: RunRecord,
    /// Suite configuration at run time; absent for runs recorded before snapshots existed.
    pub config: Option<Suite>,
    /// Repositories the cases ran in, as they were when the run started. Empty when no case has a
    /// working directory inside a git repository, and for runs recorded before this was captured.
    pub git: Vec<GitInfo>,
    /// Merged hyperfine JSON for the cases that completed.
    pub raw_output: Option<String>,
}

pub struct SuiteOutcome {
    pub results: Vec<serde_json::Value>,
    pub errors: Vec<String>,
    pub case_count: i64,
    pub git: Vec<GitInfo>,
}

pub const CANCELLED_MESSAGE: &str = "Cancelled by user. Remaining cases were not run.";

impl SuiteOutcome {
    pub fn status(&self) -> &'static str {
        match (self.results.is_empty(), self.errors.is_empty()) {
            (_, true) => "completed",
            (true, false) => "failed",
            (false, false) => "partial",
        }
    }

    pub fn raw_output(&self) -> Option<String> {
        (!self.results.is_empty())
            .then(|| serde_json::json!({ "results": self.results }).to_string())
    }
}

fn first_line(s: &str) -> &str {
    s.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
}

/// Blocking: runs each enabled case with its own hyperfine process so per-case
/// setup/cleanup/working directory apply, then merges the result arrays.
fn execute_suite(
    hyperfine_path: &std::path::Path,
    suite: &Suite,
    cancel: &AtomicBool,
) -> SuiteOutcome {
    // Captured before anything runs: it must describe the code the benchmarks measured.
    let git = git::capture_all(
        suite
            .cases
            .iter()
            .filter(|c| c.enabled)
            .filter_map(|c| c.working_directory.as_deref()),
    );
    let mut outcome = SuiteOutcome {
        results: Vec::new(),
        errors: Vec::new(),
        case_count: 0,
        git,
    };
    for case in suite.cases.iter().filter(|c| c.enabled) {
        if cancel.load(Ordering::SeqCst) {
            outcome.errors.push(CANCELLED_MESSAGE.to_string());
            break;
        }
        outcome.case_count += 1;
        let job = Job {
            name: Some(&case.name),
            command: &case.command,
            setup: case.setup_command.as_deref(),
            cleanup: case.cleanup_command.as_deref(),
            working_dir: case.working_directory.as_deref(),
            runs: Some(suite.runs as u32),
            warmup: Some(suite.warmup as u32),
            timeout: Duration::from_secs(SUITE_CASE_TIMEOUT_SECS),
            cancel: Some(cancel),
        };
        let out = match hyperfine::exec(hyperfine_path, &job) {
            Ok(o) => o,
            Err(e) => {
                outcome.errors.push(format!("\"{}\": {e}", case.name));
                continue;
            }
        };
        if out.cancelled {
            outcome.errors.push(CANCELLED_MESSAGE.to_string());
            break;
        }
        if out.timed_out {
            outcome.errors.push(format!(
                "\"{}\": timed out after {SUITE_CASE_TIMEOUT_SECS}s and was killed.",
                case.name
            ));
            continue;
        }
        let parsed = out
            .json
            .as_deref()
            .and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok())
            .and_then(|v| v.get("results").and_then(|r| r.as_array().cloned()))
            .filter(|r| !r.is_empty());
        match (out.exit_code, parsed) {
            (Some(0), Some(results)) => outcome.results.extend(results),
            (code, _) => {
                let detail = first_line(&out.stderr);
                outcome.errors.push(format!(
                    "\"{}\": hyperfine exited with code {}{}",
                    case.name,
                    code.map(|c| c.to_string())
                        .unwrap_or_else(|| "unknown".into()),
                    if detail.is_empty() {
                        String::new()
                    } else {
                        format!(" ({detail})")
                    }
                ));
            }
        }
    }
    outcome
}

fn row_to_record(r: &rusqlite::Row) -> rusqlite::Result<RunRecord> {
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
    })
}

const RECORD_COLUMNS: &str =
    "id, suite_id, suite_name, started_at, finished_at, status, tool_version, case_count, error";

pub fn insert_run(
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
    get_run(conn, &id)
}

pub fn get_run(conn: &Connection, id: &str) -> Result<RunDetail, String> {
    conn.query_row(
        &format!(
            "SELECT {RECORD_COLUMNS}, raw_output, config_json, git_json FROM runs WHERE id = ?1"
        ),
        [id],
        |r| {
            let config: Option<String> = r.get(10)?;
            let git: Option<String> = r.get(11)?;
            Ok(RunDetail {
                record: row_to_record(r)?,
                raw_output: r.get(9)?,
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

    db.with(|c| insert_run(c, &suite, &started_at, &tool_version, &outcome))
}

#[tauri::command]
pub fn list_runs_cmd(
    db: State<'_, Db>,
    suite_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<RunRecord>, String> {
    db.with(|c| list_runs(c, suite_id.as_deref(), limit.unwrap_or(50)))
}

#[tauri::command]
pub fn get_run_cmd(db: State<'_, Db>, id: String) -> Result<RunDetail, String> {
    db.with(|c| get_run(c, &id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::memory;
    use crate::suites::{Case, save_suite};
    use crate::testing::{case, git_available, real_hyperfine, suite};

    fn saved_suite(conn: &Connection) -> Suite {
        save_suite(conn, suite("S", vec![case("a")])).unwrap()
    }

    fn outcome(results: usize, errors: usize) -> SuiteOutcome {
        SuiteOutcome {
            results: (0..results)
                .map(|i| serde_json::json!({ "command": format!("c{i}") }))
                .collect(),
            errors: (0..errors).map(|i| format!("e{i}")).collect(),
            case_count: (results + errors) as i64,
            git: Vec::new(),
        }
    }

    #[test]
    fn status_reflects_mix_of_results_and_errors() {
        assert_eq!(outcome(2, 0).status(), "completed");
        assert_eq!(outcome(1, 1).status(), "partial");
        assert_eq!(outcome(0, 2).status(), "failed");
        assert!(outcome(0, 1).raw_output().is_none());
    }

    #[test]
    fn same_suite_can_be_run_twice_and_runs_are_immutable_records() {
        let conn = memory();
        let suite = saved_suite(&conn);
        let first = insert_run(
            &conn,
            &suite,
            "2026-01-01T00:00:00.000Z",
            "hyperfine 1.20.0",
            &outcome(1, 0),
        )
        .unwrap();
        let second = insert_run(
            &conn,
            &suite,
            "2026-01-02T00:00:00.000Z",
            "hyperfine 1.20.0",
            &outcome(1, 1),
        )
        .unwrap();
        assert_ne!(first.record.id, second.record.id);
        assert_eq!(second.record.status, "partial");
        assert_eq!(second.record.error.as_deref(), Some("e0"));
        assert!(first.raw_output.unwrap().contains("\"results\""));

        let listed = list_runs(&conn, Some(&suite.id), 10).unwrap();
        assert_eq!(
            listed.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(),
            [second.record.id, first.record.id]
        );
        assert_eq!(list_runs(&conn, None, 1).unwrap().len(), 1);
        assert!(list_runs(&conn, Some("nope"), 10).unwrap().is_empty());
    }

    #[test]
    fn executes_real_hyperfine_per_case_and_isolates_failures() {
        let Some(hf) = real_hyperfine() else {
            return;
        };
        let named = |name: &str, command: &str| Case {
            command: command.into(),
            ..case(name)
        };
        let disabled = Case {
            enabled: false,
            ..named("skipped", "exit 1")
        };
        let with_hooks = Case {
            setup_command: Some("echo setup".into()),
            cleanup_command: Some("echo cleanup".into()),
            ..case("hooks")
        };
        let suite = Suite {
            runs: 2,
            warmup: 1,
            ..suite(
                "S",
                vec![case("good"), named("bad", "exit 3"), disabled, with_hooks],
            )
        };
        let out = execute_suite(&hf, &suite, &AtomicBool::new(false));
        assert_eq!(out.case_count, 3);
        assert_eq!(out.status(), "partial");
        let names: Vec<_> = out
            .results
            .iter()
            .map(|r| r["command"].as_str().unwrap())
            .collect();
        assert_eq!(names, ["good", "hooks"]);
        assert_eq!(out.errors.len(), 1);
        assert!(out.errors[0].starts_with("\"bad\""), "{:?}", out.errors);
    }

    #[test]
    fn run_snapshots_configuration_and_legacy_runs_have_none() {
        let conn = memory();
        let suite = saved_suite(&conn);
        let run = insert_run(
            &conn,
            &suite,
            "2026-01-01T00:00:00.000Z",
            "v",
            &outcome(1, 0),
        )
        .unwrap();
        // Editing the suite afterwards must not change what the run recorded.
        let mut edited = suite.clone();
        edited.warmup = 9;
        edited.cases[0].command = "changed".into();
        save_suite(&conn, edited).unwrap();
        let config = get_run(&conn, &run.record.id).unwrap().config.unwrap();
        assert_eq!(
            (config.warmup, config.runs, config.cases[0].command.as_str()),
            (0, 3, "echo hi")
        );

        conn.execute(
            "UPDATE runs SET config_json = NULL WHERE id = ?1",
            [&run.record.id],
        )
        .unwrap();
        assert!(get_run(&conn, &run.record.id).unwrap().config.is_none());
    }

    /// Cancelling must return quickly and leave nothing behind.
    #[test]
    fn cancelling_stops_the_whole_process_tree_quickly() {
        let Some(hf) = real_hyperfine() else {
            return;
        };
        let long = if cfg!(windows) {
            "ping -n 41 127.0.0.1"
        } else {
            "sleep 41"
        };
        let marker = if cfg!(windows) { "-n 41" } else { "sleep 41" };
        let named = |name: &str, command: &str| Case {
            command: command.into(),
            ..case(name)
        };
        let suite = suite("S", vec![named("long", long), case("never reached")]);
        let cancel = std::sync::Arc::new(AtomicBool::new(false));
        let flag = cancel.clone();
        let canceller = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(1500));
            flag.store(true, Ordering::SeqCst);
        });
        let started = std::time::Instant::now();
        let out = execute_suite(&hf, &suite, &cancel);
        canceller.join().unwrap();

        assert!(
            started.elapsed() < Duration::from_secs(20),
            "cancel took {:?}",
            started.elapsed()
        );
        assert_eq!(out.errors, [CANCELLED_MESSAGE]);
        assert_eq!(out.case_count, 1, "second case must not start");
        assert!(out.results.is_empty());

        std::thread::sleep(Duration::from_millis(500));
        let survivors = if cfg!(windows) {
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", &format!(
                    "(Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like '*{marker}*' -and $_.Name -like 'ping*' }} | Measure-Object).Count")])
                .output()
        } else {
            std::process::Command::new("pgrep").args(["-fc", marker]).output()
        }
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
        assert!(
            survivors == "0" || survivors.is_empty(),
            "benchmarked command survived: {survivors}"
        );
    }

    /// The state is captured when the run starts, so a change made to the repository after that
    /// must not show up in the record.
    #[test]
    fn a_suite_run_records_the_git_state_of_its_working_directories() {
        let Some(hf) = real_hyperfine() else {
            return;
        };
        if !git_available() {
            return;
        }
        let git = |dir: &std::path::Path, args: &[&str]| {
            std::process::Command::new("git")
                .args([
                    "-c",
                    "user.name=t",
                    "-c",
                    "user.email=t@example.com",
                    "-c",
                    "commit.gpgsign=false",
                ])
                .args(args)
                .current_dir(dir)
                .output()
        };
        let repo = std::env::temp_dir().join(format!("benchlab-run-git-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&repo);
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q", "-b", "main"]).unwrap();
        std::fs::write(repo.join("f.txt"), "1").unwrap();
        git(&repo, &["add", "f.txt"]).unwrap();
        git(&repo, &["commit", "-q", "-m", "c"]).unwrap();
        let head = String::from_utf8(git(&repo, &["rev-parse", "HEAD"]).unwrap().stdout).unwrap();

        let in_dir = |name: &str, dir: Option<&str>| Case {
            working_directory: dir.map(Into::into),
            ..case(name)
        };
        let repo_dir = repo.to_str().unwrap();
        // two cases in one repo and one with no directory: one record, not three
        let suite = Suite {
            runs: 2,
            ..suite(
                "S",
                vec![
                    in_dir("a", Some(repo_dir)),
                    in_dir("b", Some(repo_dir)),
                    in_dir("c", None),
                ],
            )
        };
        let out = execute_suite(&hf, &suite, &AtomicBool::new(false));
        assert_eq!(out.status(), "completed");
        assert_eq!(out.git.len(), 1);
        assert_eq!(out.git[0].commit, head.trim());
        assert!(!out.git[0].dirty);
        let _ = std::fs::remove_dir_all(repo);
    }

    /// Values that look like options must be passed as values: a case named "-fast" made
    /// hyperfine reject the whole command line.
    #[test]
    fn option_like_names_and_hooks_are_passed_as_values() {
        let Some(hf) = real_hyperfine() else {
            return;
        };
        let hooked = Case {
            setup_command: Some("--version".into()),
            ..case("hooked")
        };
        let suite = Suite {
            runs: 2,
            ..suite(
                "S",
                vec![case("-fast"), case("--runs=99"), case("a=b c"), hooked],
            )
        };
        let out = execute_suite(&hf, &suite, &AtomicBool::new(false));
        let names: Vec<_> = out
            .results
            .iter()
            .map(|r| r["command"].as_str().unwrap())
            .collect();
        // setup "--version" is not a valid command, so only that case may fail
        assert_eq!(
            names,
            ["-fast", "--runs=99", "a=b c"],
            "errors: {:?}",
            out.errors
        );
        assert_eq!(
            out.results[1]["times"].as_array().unwrap().len(),
            2,
            "name must not change the run count"
        );
    }

    #[test]
    fn only_one_run_at_a_time_and_cancel_reaches_it() {
        let control = RunControl::default();
        assert!(!control.cancel(), "nothing to cancel yet");
        let first = control.begin().unwrap();
        assert!(control.begin().is_err());
        assert!(control.cancel());
        assert!(first.flag().load(Ordering::SeqCst));
        drop(first);
        assert!(
            control.begin().is_ok(),
            "slot is released when the run ends"
        );
    }

    #[test]
    fn run_stores_git_state_and_older_runs_have_none() {
        let conn = memory();
        let suite = saved_suite(&conn);
        let mut o = outcome(1, 0);
        o.git = vec![GitInfo {
            dir: "/code/app".into(),
            root: "/code/app".into(),
            commit: "9f2c1d47e0a3b58c6d1e2f4a7b9c0d3e5f6a8b1c".into(),
            short_commit: "9f2c1d4".into(),
            branch: Some("main".into()),
            dirty: true,
            changed_files: 3,
        }];
        let run = insert_run(&conn, &suite, "2026-01-01T00:00:00.000Z", "v", &o).unwrap();
        let stored = get_run(&conn, &run.record.id).unwrap().git;
        assert_eq!(stored, o.git);

        conn.execute(
            "UPDATE runs SET git_json = NULL WHERE id = ?1",
            [&run.record.id],
        )
        .unwrap();
        assert!(get_run(&conn, &run.record.id).unwrap().git.is_empty());
    }

    #[test]
    fn run_keeps_suite_name_snapshot_after_rename() {
        let conn = memory();
        let suite = saved_suite(&conn);
        let run = insert_run(
            &conn,
            &suite,
            "2026-01-01T00:00:00.000Z",
            "v",
            &outcome(1, 0),
        )
        .unwrap();
        conn.execute(
            "UPDATE suites SET name = 'Other' WHERE id = ?1",
            [&suite.id],
        )
        .unwrap();
        assert_eq!(
            get_run(&conn, &run.record.id).unwrap().record.suite_name,
            "S"
        );
    }
}
