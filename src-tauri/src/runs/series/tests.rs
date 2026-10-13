use super::*;
use crate::db::memory;
use crate::git::GitInfo;
use crate::runs::store::insert_run;
use crate::suites::{Suite, save_suite};
use crate::testing::{case, outcome, suite};
use serde_json::json;

fn saved_suite(conn: &Connection, name: &str) -> Suite {
    save_suite(conn, suite(name, vec![case("a")])).unwrap()
}

fn result(name: &str, mean: f64, times: usize) -> serde_json::Value {
    json!({
        "command": name, "mean": mean, "stddev": mean / 10.0, "median": mean,
        "min": mean * 0.9, "max": mean * 1.1, "times": vec![mean; times],
    })
}

/// Records a run through the normal insert path with the given results.
fn record(
    conn: &Connection,
    suite: &Suite,
    started_at: &str,
    results: Vec<serde_json::Value>,
) -> String {
    let mut o = outcome(0, 0);
    o.case_count = results.len() as i64;
    o.results = results;
    insert_run(conn, suite, started_at, "hyperfine 1.20.0", &o)
        .unwrap()
        .record
        .id
}

fn rows_for(conn: &Connection, run_id: &str) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM run_cases WHERE run_id = ?1",
        [run_id],
        |r| r.get(0),
    )
    .unwrap()
}

#[test]
fn json_extract_is_available() {
    let conn = memory();
    let n: i64 = conn
        .query_row("SELECT json_extract('{\"a\":1}', '$.a')", [], |r| r.get(0))
        .unwrap();
    assert_eq!(n, 1);
}

#[test]
fn inserting_a_run_indexes_one_row_per_case_with_the_sample_count() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    let id = record(
        &conn,
        &s,
        "2026-01-01T00:00:00.000Z",
        vec![result("a", 0.01, 10), result("b", 0.02, 3)],
    );
    assert_eq!(rows_for(&conn, &id), 2);
    let samples: Vec<i64> = conn
        .prepare("SELECT samples FROM run_cases WHERE run_id = ?1 ORDER BY case_name")
        .unwrap()
        .query_map([&id], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(samples, [10, 3]);
}

#[test]
fn a_missing_or_null_stddev_is_stored_as_null() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    let null_sd = json!({"command":"a","mean":1.0,"stddev":null,"median":1.0,"min":1.0,"max":1.0,"times":[1.0]});
    let no_sd = json!({"command":"b","mean":1.0,"median":1.0,"min":1.0,"max":1.0,"times":[1.0]});
    let id = record(&conn, &s, "2026-01-01T00:00:00.000Z", vec![null_sd, no_sd]);
    let nulls: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM run_cases WHERE run_id = ?1 AND stddev IS NULL",
            [&id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(nulls, 2);
}

#[test]
fn results_missing_a_required_number_are_skipped_not_fatal() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    let broken = json!({"command": "no mean", "median": 1.0, "min": 1.0, "max": 1.0});
    let id = record(
        &conn,
        &s,
        "2026-01-01T00:00:00.000Z",
        vec![broken, result("ok", 0.01, 5)],
    );
    assert_eq!(
        rows_for(&conn, &id),
        1,
        "the run itself must still be saved"
    );
}

#[test]
fn backfill_indexes_runs_recorded_before_the_table_existed_and_is_idempotent() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    let raw = json!({ "results": [result("a", 0.01, 4)] }).to_string();
    conn.execute(
        "INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status,
                           tool_version, case_count, raw_output)
         VALUES ('old', ?1, 'S', 't', 't', 'completed', 'v', 1, ?2)",
        params![s.id, raw],
    )
    .unwrap();
    assert_eq!(rows_for(&conn, "old"), 0);
    assert_eq!(backfill_run_cases(&conn).unwrap(), 1);
    assert_eq!(rows_for(&conn, "old"), 1);
    assert_eq!(
        backfill_run_cases(&conn).unwrap(),
        0,
        "second pass finds nothing to do"
    );
    assert_eq!(rows_for(&conn, "old"), 1);
}

#[test]
fn runs_without_raw_output_get_no_rows() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    conn.execute(
        "INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status,
                           tool_version, case_count, raw_output)
         VALUES ('failed', ?1, 'S', 't', 't', 'failed', 'v', 1, NULL)",
        [&s.id],
    )
    .unwrap();
    assert_eq!(backfill_run_cases(&conn).unwrap(), 0);
    assert_eq!(rows_for(&conn, "failed"), 0);
}

#[test]
fn deleting_a_suite_removes_its_indexed_rows() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    let id = record(
        &conn,
        &s,
        "2026-01-01T00:00:00.000Z",
        vec![result("a", 0.01, 5)],
    );
    crate::suites::delete_suite(&conn, &s.id).unwrap();
    assert_eq!(rows_for(&conn, &id), 0);
}

#[test]
fn series_is_oldest_first_and_limited_to_the_newest_runs() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    for (i, day) in ["01", "02", "03", "04"].iter().enumerate() {
        record(
            &conn,
            &s,
            &format!("2026-01-{day}T00:00:00.000Z"),
            vec![result("a", 0.01 * (i + 1) as f64, 5)],
        );
    }
    let all = case_series(&conn, &s.id, "a", 10).unwrap();
    assert_eq!(
        all.iter().map(|p| p.mean).collect::<Vec<_>>(),
        [0.01, 0.02, 0.03, 0.04]
    );
    let newest_two = case_series(&conn, &s.id, "a", 2).unwrap();
    assert_eq!(
        newest_two.iter().map(|p| p.mean).collect::<Vec<_>>(),
        [0.03, 0.04]
    );
}

#[test]
fn a_case_missing_from_a_run_leaves_a_gap_not_a_zero() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    record(
        &conn,
        &s,
        "2026-01-01T00:00:00.000Z",
        vec![result("a", 0.01, 5), result("b", 0.5, 5)],
    );
    record(
        &conn,
        &s,
        "2026-01-02T00:00:00.000Z",
        vec![result("a", 0.01, 5)],
    );
    record(
        &conn,
        &s,
        "2026-01-03T00:00:00.000Z",
        vec![result("a", 0.01, 5), result("b", 0.6, 5)],
    );
    let b = case_series(&conn, &s.id, "b", 10).unwrap();
    assert_eq!(b.iter().map(|p| p.mean).collect::<Vec<_>>(), [0.5, 0.6]);
}

#[test]
fn failed_runs_are_excluded_from_a_series() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    let bad = record(
        &conn,
        &s,
        "2026-01-01T00:00:00.000Z",
        vec![result("a", 9.0, 5)],
    );
    record(
        &conn,
        &s,
        "2026-01-02T00:00:00.000Z",
        vec![result("a", 0.01, 5)],
    );
    conn.execute("UPDATE runs SET status = 'failed' WHERE id = ?1", [&bad])
        .unwrap();
    let series = case_series(&conn, &s.id, "a", 10).unwrap();
    assert_eq!(series.len(), 1);
    assert_eq!(series[0].mean, 0.01);
}

#[test]
fn another_suites_runs_never_appear() {
    let conn = memory();
    let (a, b) = (saved_suite(&conn, "A"), saved_suite(&conn, "B"));
    record(
        &conn,
        &a,
        "2026-01-01T00:00:00.000Z",
        vec![result("a", 0.01, 5)],
    );
    record(
        &conn,
        &b,
        "2026-01-02T00:00:00.000Z",
        vec![result("a", 7.0, 5)],
    );
    assert_eq!(case_series(&conn, &a.id, "a", 10).unwrap().len(), 1);
    assert_eq!(case_names(&conn, &a.id).unwrap(), ["a"]);
}

#[test]
fn git_fields_come_from_the_first_recorded_repository_and_are_none_without_one() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    let mut with_git = outcome(0, 0);
    with_git.results = vec![result("a", 0.01, 5)];
    with_git.git = vec![GitInfo {
        dir: "/code".into(),
        root: "/code".into(),
        commit: "9f2c1d47e0a3b58c6d1e2f4a7b9c0d3e5f6a8b1c".into(),
        short_commit: "9f2c1d4".into(),
        branch: Some("main".into()),
        dirty: true,
        changed_files: 2,
    }];
    insert_run(&conn, &s, "2026-01-01T00:00:00.000Z", "v", &with_git).unwrap();
    record(
        &conn,
        &s,
        "2026-01-02T00:00:00.000Z",
        vec![result("a", 0.01, 5)],
    );

    let series = case_series(&conn, &s.id, "a", 10).unwrap();
    assert_eq!(series[0].short_commit.as_deref(), Some("9f2c1d4"));
    assert_eq!(series[0].branch.as_deref(), Some("main"));
    assert!(series[0].dirty);
    assert_eq!(series[1].commit, None);
    assert!(!series[1].dirty);
}

#[test]
fn case_names_lists_names_from_every_run_once_sorted() {
    let conn = memory();
    let s = saved_suite(&conn, "S");
    record(
        &conn,
        &s,
        "2026-01-01T00:00:00.000Z",
        vec![result("zeta", 0.01, 5), result("old", 0.01, 5)],
    );
    record(
        &conn,
        &s,
        "2026-01-02T00:00:00.000Z",
        vec![result("zeta", 0.01, 5), result("alpha", 0.01, 5)],
    );
    assert_eq!(case_names(&conn, &s.id).unwrap(), ["alpha", "old", "zeta"]);
}
