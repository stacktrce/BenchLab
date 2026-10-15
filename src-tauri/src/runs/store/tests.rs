use super::*;
use crate::db::memory;
use crate::git::GitInfo;
use crate::suites::save_suite;
use crate::testing::{case, outcome, suite};

fn saved_suite(conn: &Connection) -> Suite {
    save_suite(conn, suite("S", vec![case("a")])).unwrap()
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

#[test]
fn run_durations_are_seconds_of_completed_runs_newest_first() {
    let conn = memory();
    let s = saved_suite(&conn);
    let add = |id: &str, started: &str, finished: &str, status: &str| {
        conn.execute(
            "INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status, tool_version, case_count)
             VALUES (?1, ?2, 'S', ?3, ?4, ?5, 'h', 1)",
            rusqlite::params![id, s.id, started, finished, status],
        )
        .unwrap();
    };
    add(
        "old",
        "2026-01-01T10:00:00.000Z",
        "2026-01-01T10:01:30.000Z",
        "completed",
    );
    add(
        "new",
        "2026-01-02T10:00:00.000Z",
        "2026-01-02T10:00:20.500Z",
        "completed",
    );
    add(
        "failed",
        "2026-01-03T10:00:00.000Z",
        "2026-01-03T10:00:01.000Z",
        "failed",
    );
    let durations = run_durations(&conn, &s.id, 10).unwrap();
    assert_eq!(durations.len(), 2);
    assert!((durations[0] - 20.5).abs() < 0.01, "{durations:?}");
    assert!((durations[1] - 90.0).abs() < 0.01, "{durations:?}");
    assert_eq!(run_durations(&conn, &s.id, 1).unwrap().len(), 1);
}
