use super::*;

#[cfg(test)]
mod crud_tests {
    use super::*;
    use crate::db::memory;
    use crate::testing::suite;

    /// Carries a whitespace-only setup command to check that blank hooks are stored as none.
    fn case(name: &str, command: &str) -> Case {
        Case {
            command: command.into(),
            setup_command: Some("  ".into()),
            ..crate::testing::case(name)
        }
    }

    #[test]
    fn rejects_invalid_suites_with_every_problem() {
        let conn = memory();
        let err = save_suite(&conn, suite(" ", vec![case("a", ""), case("a", "x")])).unwrap_err();
        assert!(err.contains("Suite name is required"));
        assert!(err.contains("command is required"));
        assert!(err.contains("used more than once"));
        assert!(
            save_suite(&conn, suite("s", vec![]))
                .unwrap_err()
                .contains("at least one case")
        );
        assert!(list_suites(&conn).unwrap().is_empty());
    }

    #[test]
    fn create_load_and_blank_optionals_become_none() {
        let conn = memory();
        let saved = save_suite(
            &conn,
            suite("S", vec![case("a", "echo a"), case("b", "echo b")]),
        )
        .unwrap();
        assert!(!saved.id.is_empty());
        assert_eq!(saved.schema_version, SCHEMA_VERSION);
        assert_eq!(
            saved
                .cases
                .iter()
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>(),
            ["a", "b"]
        );
        assert_eq!(saved.cases[0].setup_command, None);
        assert!(!saved.cases[0].id.is_empty());
    }

    #[test]
    fn edit_keeps_case_ids_applies_reorder_and_removal() {
        let conn = memory();
        let saved = save_suite(
            &conn,
            suite("S", vec![case("a", "1"), case("b", "2"), case("c", "3")]),
        )
        .unwrap();
        let (a, b) = (saved.cases[0].clone(), saved.cases[1].clone());
        let mut edited = saved.clone();
        edited.name = "Renamed".into();
        edited.cases = vec![b.clone(), a.clone()];
        let after = save_suite(&conn, edited).unwrap();
        assert_eq!(after.name, "Renamed");
        assert_eq!(after.cases.len(), 2);
        assert_eq!(after.cases[0].id, b.id);
        assert_eq!(after.cases[1].id, a.id);
    }

    #[test]
    fn failed_edit_leaves_suite_untouched() {
        let conn = memory();
        let saved = save_suite(&conn, suite("S", vec![case("a", "1")])).unwrap();
        let mut bad = saved.clone();
        bad.cases.push(case("a", "dup"));
        assert!(save_suite(&conn, bad).is_err());
        assert_eq!(load_suite(&conn, &saved.id).unwrap().cases.len(), 1);
    }

    #[test]
    fn duplicate_gets_new_ids_and_delete_cascades() {
        let conn = memory();
        let saved = save_suite(&conn, suite("S", vec![case("a", "1")])).unwrap();
        let copy = duplicate_suite(&conn, &saved.id).unwrap();
        assert_eq!(copy.name, "S (copy)");
        assert_ne!(copy.id, saved.id);
        assert_ne!(copy.cases[0].id, saved.cases[0].id);
        delete_suite(&conn, &saved.id).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM cases", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        assert_eq!(list_suites(&conn).unwrap().len(), 1);
        assert!(delete_suite(&conn, &saved.id).is_err());
    }
}

#[cfg(test)]
mod migration_tests {
    use super::*;

    #[test]
    fn existing_v1_database_upgrades_and_keeps_data() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        // Simulate a v1 database created by the previous build.
        let v1 = crate::db::migration_sql(0);
        conn.execute_batch(v1).unwrap();
        conn.pragma_update(None, "user_version", 1i64).unwrap();
        conn.execute(
            "INSERT INTO suites (id, name, runs, created_at, updated_at) VALUES ('s','Old',5,'t','t')",
            [],
        )
        .unwrap();
        crate::db::init(&conn).unwrap();
        let suite = load_suite(&conn, "s").unwrap();
        assert_eq!(
            (suite.name.as_str(), suite.runs, suite.warmup),
            ("Old", 5, 0)
        );
    }
}

#[cfg(test)]
mod baseline_tests {
    use super::*;
    use crate::db::memory;
    use crate::testing::{case, suite};

    fn make_suite(conn: &Connection, name: &str) -> Suite {
        save_suite(conn, suite(name, vec![case("a")])).unwrap()
    }

    fn add_run(conn: &Connection, id: &str, suite: &Suite, raw_output: Option<&str>) {
        conn.execute(
            "INSERT INTO runs (id, suite_id, suite_name, started_at, finished_at, status,
                               tool_version, case_count, raw_output)
             VALUES (?1, ?2, ?3, 't', 't', 'completed', 'v', 1, ?4)",
            params![id, suite.id, suite.name, raw_output],
        )
        .unwrap();
    }

    #[test]
    fn pin_and_unpin() {
        let conn = memory();
        let suite = make_suite(&conn, "S");
        add_run(&conn, "r1", &suite, Some("{}"));
        assert_eq!(
            set_baseline(&conn, &suite.id, Some("r1"))
                .unwrap()
                .baseline_run_id
                .as_deref(),
            Some("r1")
        );
        assert_eq!(
            load_suite(&conn, &suite.id)
                .unwrap()
                .baseline_run_id
                .as_deref(),
            Some("r1")
        );
        assert_eq!(
            set_baseline(&conn, &suite.id, None)
                .unwrap()
                .baseline_run_id,
            None
        );
    }

    #[test]
    fn rejects_unknown_foreign_and_resultless_runs() {
        let conn = memory();
        let (a, b) = (make_suite(&conn, "A"), make_suite(&conn, "B"));
        add_run(&conn, "other", &b, Some("{}"));
        add_run(&conn, "empty", &a, None);
        assert_eq!(
            set_baseline(&conn, &a.id, Some("nope")).unwrap_err(),
            "Run not found."
        );
        assert!(
            set_baseline(&conn, &a.id, Some("other"))
                .unwrap_err()
                .contains("different suite")
        );
        assert!(
            set_baseline(&conn, &a.id, Some("empty"))
                .unwrap_err()
                .contains("no results")
        );
        assert_eq!(
            set_baseline(&conn, "missing", None).unwrap_err(),
            "Suite not found."
        );
        assert_eq!(load_suite(&conn, &a.id).unwrap().baseline_run_id, None);
    }

    #[test]
    fn editing_the_suite_neither_clears_nor_changes_the_baseline() {
        let conn = memory();
        let suite = make_suite(&conn, "S");
        add_run(&conn, "r1", &suite, Some("{}"));
        let pinned = set_baseline(&conn, &suite.id, Some("r1")).unwrap();

        // the form sends the suite back without (or with a stale) baseline
        let mut edited = pinned.clone();
        edited.name = "Renamed".into();
        edited.baseline_run_id = None;
        assert_eq!(
            save_suite(&conn, edited)
                .unwrap()
                .baseline_run_id
                .as_deref(),
            Some("r1")
        );
        let mut tampered = pinned;
        tampered.baseline_run_id = Some("whatever".into());
        assert_eq!(
            save_suite(&conn, tampered)
                .unwrap()
                .baseline_run_id
                .as_deref(),
            Some("r1")
        );
    }

    #[test]
    fn a_duplicate_does_not_inherit_the_baseline_and_a_pinned_suite_can_be_deleted() {
        let conn = memory();
        let suite = make_suite(&conn, "S");
        add_run(&conn, "r1", &suite, Some("{}"));
        set_baseline(&conn, &suite.id, Some("r1")).unwrap();
        let copy = duplicate_suite(&conn, &suite.id).unwrap();
        assert_eq!(copy.baseline_run_id, None);
        // suites and runs reference each other; deleting must not trip a foreign key
        delete_suite(&conn, &suite.id).unwrap();
        assert!(list_suites(&conn).unwrap().iter().all(|s| s.id != suite.id));
    }
}

#[cfg(test)]
mod budget_tests {
    use super::*;
    use crate::db::memory;
    use crate::testing::{case, suite};

    fn suite_with_budget(budget: Option<f64>) -> Suite {
        suite(
            "S",
            vec![Case {
                budget_percent: budget,
                ..case("a")
            }],
        )
    }

    #[test]
    fn a_budget_round_trips_and_none_stays_none() {
        let conn = memory();
        let with = save_suite(&conn, suite_with_budget(Some(7.5))).unwrap();
        assert_eq!(with.cases[0].budget_percent, Some(7.5));
        assert_eq!(
            load_suite(&conn, &with.id).unwrap().cases[0].budget_percent,
            Some(7.5)
        );
        let without = save_suite(&conn, suite_with_budget(None)).unwrap();
        assert_eq!(without.cases[0].budget_percent, None);
    }

    #[test]
    fn a_budget_can_be_removed_by_editing() {
        let conn = memory();
        let mut saved = save_suite(&conn, suite_with_budget(Some(5.0))).unwrap();
        saved.cases[0].budget_percent = None;
        assert_eq!(
            save_suite(&conn, saved).unwrap().cases[0].budget_percent,
            None
        );
    }

    #[test]
    fn rejects_zero_negative_and_non_finite_budgets() {
        let conn = memory();
        for bad in [0.0, -5.0, f64::INFINITY, f64::NAN] {
            let err = save_suite(&conn, suite_with_budget(Some(bad))).unwrap_err();
            assert!(
                err.contains("budget must be a number above 0"),
                "{bad}: {err}"
            );
        }
        assert!(list_suites(&conn).unwrap().is_empty());
    }

    #[test]
    fn older_snapshots_without_the_field_still_load() {
        let json = r#"{"name":"a","command":"echo"}"#;
        let case: Case = serde_json::from_str(json).unwrap();
        assert_eq!(case.budget_percent, None);
    }
}
