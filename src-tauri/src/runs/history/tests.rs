use super::*;
use crate::db::memory;
use crate::suites::{load_suite, save_suite, set_baseline};
use crate::testing::{case, suite};
use rusqlite::params;

/// Inserts a run directly, so the test controls suite, time, status and git state.
fn add(conn: &Connection, id: &str, suite_id: &str, started: &str, status: &str, branch: &str) {
    let git = format!(
        r#"[{{"dir":"d","root":"d","commit":"abc{id}","shortCommit":"abc","branch":"{branch}","dirty":false,"changedFiles":0}}]"#
    );
    conn.execute(
        "INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status, tool_version, case_count, git_json)
         SELECT ?1, id, name, ?3, ?3, ?4, 'h', 1, ?5 FROM suites WHERE id = ?2",
        params![id, suite_id, started, status, git],
    )
    .unwrap();
}

fn fixture() -> (Connection, String, String) {
    let conn = memory();
    let a = save_suite(&conn, suite("Alpha", vec![case("x")]))
        .unwrap()
        .id;
    let b = save_suite(&conn, suite("Beta 100%", vec![case("x")]))
        .unwrap()
        .id;
    add(
        &conn,
        "r1",
        &a,
        "2026-10-01T09:00:00.000Z",
        "completed",
        "main",
    );
    add(
        &conn,
        "r2",
        &a,
        "2026-10-05T09:00:00.000Z",
        "failed",
        "perf/join",
    );
    add(
        &conn,
        "r3",
        &b,
        "2026-10-05T23:59:00.000Z",
        "completed",
        "main",
    );
    add(
        &conn,
        "r4",
        &b,
        "2026-10-09T09:00:00.000Z",
        "partial",
        "main",
    );
    (conn, a, b)
}

fn ids(page: &Page<HistoryRow>) -> Vec<&str> {
    page.items.iter().map(|r| r.record.id.as_str()).collect()
}

#[test]
fn no_filter_lists_every_run_newest_first() {
    let (conn, _, _) = fixture();
    let page = search_runs(&conn, &RunFilter::default(), 50, 0).unwrap();
    assert_eq!(ids(&page), ["r4", "r3", "r2", "r1"]);
    assert_eq!(page.total, 4);
}

#[test]
fn each_filter_narrows_and_they_combine() {
    let (conn, a, _) = fixture();
    let by_suite = RunFilter {
        suite_id: Some(a.clone()),
        ..Default::default()
    };
    assert_eq!(
        ids(&search_runs(&conn, &by_suite, 50, 0).unwrap()),
        ["r2", "r1"]
    );
    let by_status = RunFilter {
        status: Some("completed".into()),
        ..Default::default()
    };
    assert_eq!(
        ids(&search_runs(&conn, &by_status, 50, 0).unwrap()),
        ["r3", "r1"]
    );
    let both = RunFilter {
        suite_id: Some(a),
        status: Some("failed".into()),
        ..Default::default()
    };
    assert_eq!(ids(&search_runs(&conn, &both, 50, 0).unwrap()), ["r2"]);
}

#[test]
fn the_time_range_includes_its_start_and_excludes_its_end() {
    let (conn, _, _) = fixture();
    // One local day at UTC+1: Oct 5 00:00 to Oct 6 00:00 local.
    let f = RunFilter {
        from: Some("2026-10-04T23:00:00.000Z".into()),
        to: Some("2026-10-05T23:00:00.000Z".into()),
        ..Default::default()
    };
    // r3 started at 23:59 UTC on Oct 5, which is already Oct 6 at UTC+1.
    assert_eq!(ids(&search_runs(&conn, &f, 50, 0).unwrap()), ["r2"]);
    let empty = RunFilter {
        from: Some("2026-10-05T09:00:00.000Z".into()),
        to: Some("2026-10-05T09:00:00.000Z".into()),
        ..Default::default()
    };
    assert!(search_runs(&conn, &empty, 50, 0).unwrap().items.is_empty());
}

#[test]
fn text_matches_suite_branch_note_and_tags_ignoring_case_and_wildcards() {
    let (conn, _, _) = fixture();
    let text = |t: &str| RunFilter {
        text: Some(t.into()),
        ..Default::default()
    };
    assert_eq!(
        ids(&search_runs(&conn, &text("ALPHA"), 50, 0).unwrap()),
        ["r2", "r1"]
    );
    assert_eq!(
        ids(&search_runs(&conn, &text("perf/"), 50, 0).unwrap()),
        ["r2"]
    );
    // "%" is a literal percent sign, not "anything".
    assert_eq!(
        ids(&search_runs(&conn, &text("100%"), 50, 0).unwrap()),
        ["r4", "r3"]
    );
    assert!(
        search_runs(&conn, &text("_"), 50, 0)
            .unwrap()
            .items
            .is_empty()
    );
    set_run_meta(&conn, "r1", Some("Laptop on battery"), &["noisy".into()]).unwrap();
    // JSON keys and punctuation are not content, so they must not match every run.
    for syntax in ["root", "dirty", "changedFiles", "\"", ",", "["] {
        assert!(
            search_runs(&conn, &text(syntax), 50, 0)
                .unwrap()
                .items
                .is_empty(),
            "{syntax}"
        );
    }
    assert_eq!(
        ids(&search_runs(&conn, &text("abcr4"), 50, 0).unwrap()),
        ["r4"]
    );
    assert_eq!(
        ids(&search_runs(&conn, &text("battery"), 50, 0).unwrap()),
        ["r1"]
    );
    let tag = RunFilter {
        tag: Some("noisy".into()),
        ..Default::default()
    };
    assert_eq!(ids(&search_runs(&conn, &tag, 50, 0).unwrap()), ["r1"]);
}

#[test]
fn rows_carry_the_code_state_the_run_measured() {
    let (conn, _, _) = fixture();
    let page = search_runs(&conn, &RunFilter::default(), 50, 0).unwrap();
    let r2 = page.items.iter().find(|r| r.record.id == "r2").unwrap();
    assert_eq!(r2.git[0].branch.as_deref(), Some("perf/join"));
}

#[test]
fn pages_slice_the_results_and_the_total_ignores_the_limit() {
    let (conn, _, _) = fixture();
    let page = search_runs(&conn, &RunFilter::default(), 2, 2).unwrap();
    assert_eq!(ids(&page), ["r2", "r1"]);
    assert_eq!(page.total, 4);
}

#[test]
fn notes_and_tags_are_normalised_and_capped() {
    let (conn, _, _) = fixture();
    let tags = vec![" fast ".to_string(), "".into(), "fast".into(), "ci".into()];
    let record = set_run_meta(&conn, "r1", Some("  checked  "), &tags).unwrap();
    assert_eq!(record.note.as_deref(), Some("checked"));
    assert_eq!(record.tags, ["fast", "ci"]);
    let cleared = set_run_meta(&conn, "r1", Some("   "), &[]).unwrap();
    assert_eq!(cleared.note, None);
    assert!(set_run_meta(&conn, "r1", Some(&"n".repeat(NOTE_MAX_CHARS + 1)), &[]).is_err());
    let many: Vec<String> = (0..TAGS_MAX + 1).map(|i| format!("t{i}")).collect();
    assert!(set_run_meta(&conn, "r1", None, &many).is_err());
    assert!(set_run_meta(&conn, "missing", None, &[]).is_err());
}

#[test]
fn deleting_runs_removes_their_data_and_clears_a_pinned_baseline() {
    let (conn, a, _) = fixture();
    // Only a run with results can be pinned.
    conn.execute(
        "UPDATE runs SET raw_output = '{\"results\":[]}' WHERE id = 'r1'",
        [],
    )
    .unwrap();
    set_baseline(&conn, &a, Some("r1")).unwrap();
    conn.execute(
        "INSERT INTO run_cases (run_id, case_name, mean, median, min, max, samples) VALUES ('r1','x',1,1,1,1,1)",
        [],
    )
    .unwrap();
    assert_eq!(delete_runs(&conn, &["r1".into(), "r2".into()]).unwrap(), 2);
    assert_eq!(load_suite(&conn, &a).unwrap().baseline_run_id, None);
    let cases: i64 = conn
        .query_row("SELECT COUNT(*) FROM run_cases", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cases, 0);
    assert_eq!(
        search_runs(&conn, &RunFilter::default(), 50, 0)
            .unwrap()
            .total,
        2
    );
}

#[test]
fn deleting_an_unknown_run_is_not_an_error() {
    let (conn, _, _) = fixture();
    assert_eq!(delete_runs(&conn, &["nope".into()]).unwrap(), 0);
}

#[test]
fn a_version_8_database_upgrades_and_its_runs_have_no_note_or_tags() {
    let conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "foreign_keys", true).unwrap();
    for i in 0..8 {
        conn.execute_batch(crate::db::migration_sql(i)).unwrap();
    }
    conn.pragma_update(None, "user_version", 8i64).unwrap();
    conn.execute_batch(
        "INSERT INTO suites (id, name, runs, created_at, updated_at) VALUES ('s','Old',5,'t','t');
         INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status, tool_version, case_count)
         VALUES ('r','s','Old','t','t','completed','h',1);",
    )
    .unwrap();
    crate::db::init(&conn).unwrap();
    let page = search_runs(&conn, &RunFilter::default(), 50, 0).unwrap();
    assert_eq!(page.items[0].record.note, None);
    assert!(page.items[0].record.tags.is_empty());
    assert!(page.items[0].git.is_empty());
}

#[test]
fn a_bulk_delete_that_fails_part_way_deletes_nothing() {
    let (conn, _, _) = fixture();
    conn.execute_batch(
        "CREATE TEMP TRIGGER refuse_r2 BEFORE DELETE ON runs WHEN old.id = 'r2'
         BEGIN SELECT RAISE(ABORT, 'refused'); END;",
    )
    .unwrap();
    assert!(delete_runs(&conn, &["r1".into(), "r2".into()]).is_err());
    assert_eq!(
        search_runs(&conn, &RunFilter::default(), 50, 0)
            .unwrap()
            .total,
        4
    );
}
