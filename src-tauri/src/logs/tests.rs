use super::*;
use crate::db::memory;
use crate::runs::insert_run_for_tests;
use crate::suites::{delete_suite, save_suite};
use crate::testing::{case, outcome, suite};

fn chunk(case: &str, stream: LogStream, body: &str) -> LogChunk {
    LogChunk {
        case: case.into(),
        stream,
        body: body.into(),
        truncated: false,
    }
}

/// A suite with one recorded run, for log rows to point at.
fn run_id(conn: &Connection) -> String {
    let s = save_suite(conn, suite("S", vec![case("a")])).unwrap();
    insert_run_for_tests(conn, &s, &outcome(1, 0)).record.id
}

#[test]
fn cap_cuts_overlong_lines_and_marks_them() {
    let line = "x".repeat(50);
    let (text, cut) = cap(&format!("{line}\nshort"), 1_000, 10);
    assert!(cut);
    assert_eq!(text, format!("{}{LINE_CUT_MARK}\nshort", "x".repeat(10)));
}

#[test]
fn cap_never_splits_a_multibyte_character() {
    let (text, cut) = cap(&"é".repeat(10), 5, 1_000);
    assert!(cut);
    assert_eq!(text, "éé");
}

#[test]
fn cap_reports_false_when_nothing_was_cut() {
    assert_eq!(cap("a\nb\n", 100, 100), ("a\nb\n".to_string(), false));
}

#[test]
fn a_case_over_its_cap_is_truncated() {
    let conn = memory();
    let id = run_id(&conn);
    // Many short lines, so only the per-case cap applies, not the per-line one.
    let big = "yyy
"
    .repeat(CASE_CAP_BYTES / 4 + 10);
    store_logs(&conn, &id, &[chunk("a", LogStream::Hyperfine, &big)]).unwrap();
    let logs = run_logs(&conn, &id).unwrap();
    assert!(logs[0].truncated);
    assert_eq!(logs[0].body.len(), CASE_CAP_BYTES);
}

#[test]
fn a_run_over_its_cap_drops_later_cases_logs_and_marks_them() {
    let conn = memory();
    let id = run_id(&conn);
    let per_case = "zzz
"
    .repeat(CASE_CAP_BYTES / 4);
    let names: Vec<String> = (0..=RUN_CAP_BYTES / CASE_CAP_BYTES + 1)
        .map(|i| format!("c{i}"))
        .collect();
    let chunks: Vec<_> = names
        .iter()
        .map(|n| chunk(n, LogStream::Hyperfine, &per_case))
        .collect();
    store_logs(&conn, &id, &chunks).unwrap();
    let logs = run_logs(&conn, &id).unwrap();
    let total: usize = logs.iter().map(|l| l.body.len()).sum();
    assert!(total <= RUN_CAP_BYTES, "{total}");
    let last = logs.last().unwrap();
    assert!(last.truncated && last.body.is_empty());
}

#[test]
fn logs_round_trip_in_case_order() {
    let conn = memory();
    let id = run_id(&conn);
    let chunks = vec![
        chunk("second", LogStream::Hyperfine, "b"),
        chunk("first", LogStream::Hyperfine, "a"),
        chunk("first", LogStream::Command, "out"),
    ];
    store_logs(&conn, &id, &chunks).unwrap();
    assert_eq!(run_logs(&conn, &id).unwrap(), chunks);
}

#[test]
fn deleting_the_suite_deletes_its_runs_logs() {
    let conn = memory();
    let id = run_id(&conn);
    store_logs(&conn, &id, &[chunk("a", LogStream::Hyperfine, "x")]).unwrap();
    let suite_id: String = conn
        .query_row("SELECT suite_id FROM runs WHERE id = ?1", [&id], |r| {
            r.get(0)
        })
        .unwrap();
    delete_suite(&conn, &suite_id).unwrap();
    let left: i64 = conn
        .query_row("SELECT COUNT(*) FROM run_logs", [], |r| r.get(0))
        .unwrap();
    assert_eq!(left, 0);
}

#[test]
fn a_run_inserted_with_logs_stores_them() {
    let conn = memory();
    let s = save_suite(&conn, suite("S", vec![case("a")])).unwrap();
    let mut o = outcome(1, 0);
    o.logs = vec![chunk("c0", LogStream::Hyperfine, "Benchmark 1: c0")];
    let run = insert_run_for_tests(&conn, &s, &o);
    assert_eq!(run_logs(&conn, &run.record.id).unwrap(), o.logs);
}

#[test]
fn a_version_7_database_upgrades_and_keeps_its_runs() {
    let conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "foreign_keys", true).unwrap();
    for i in 0..7 {
        conn.execute_batch(crate::db::migration_sql(i)).unwrap();
    }
    conn.pragma_update(None, "user_version", 7i64).unwrap();
    conn.execute_batch(
        "INSERT INTO suites (id, name, runs, created_at, updated_at) VALUES ('s','Old',5,'t','t');
         INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status, tool_version, case_count)
         VALUES ('r','s','Old','t','t','completed','h',1);",
    )
    .unwrap();
    crate::db::init(&conn).unwrap();
    assert!(run_logs(&conn, "r").unwrap().is_empty());
    store_logs(&conn, "r", &[chunk("a", LogStream::Hyperfine, "x")]).unwrap();
    let runs: i64 = conn
        .query_row("SELECT COUNT(*) FROM runs", [], |r| r.get(0))
        .unwrap();
    assert_eq!(runs, 1);
}
