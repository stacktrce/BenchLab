use crate::db::{Db, now_iso, sql_err};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

pub const SCHEMA_VERSION: i64 = 1;

fn default_true() -> bool {
    true
}

fn default_runs() -> i64 {
    10
}

fn default_warmup() -> i64 {
    1
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    /// Empty for a case that has not been saved yet.
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub setup_command: Option<String>,
    #[serde(default)]
    pub cleanup_command: Option<String>,
    #[serde(default)]
    pub working_directory: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Flag this case when it is slower than the baseline by more than this many percent.
    /// Only a confident breach counts (see the comparison view); None means no budget.
    #[serde(default)]
    pub budget_percent: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Suite {
    /// Empty for a suite that has not been saved yet.
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_runs")]
    pub runs: i64,
    /// Untimed runs before measuring, to fill caches.
    #[serde(default = "default_warmup")]
    pub warmup: i64,
    /// The run comparisons use by default. Changed only through `set_baseline`: saving a suite
    /// neither sets nor clears it, so editing the form cannot unpin by accident.
    #[serde(default)]
    pub baseline_run_id: Option<String>,
    #[serde(default)]
    pub schema_version: i64,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    pub cases: Vec<Case>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SuiteSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub case_count: i64,
    pub updated_at: String,
}

fn none_if_blank(v: &Option<String>) -> Option<String> {
    v.as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Returns every validation problem; empty means valid.
pub fn validate(suite: &Suite) -> Vec<String> {
    let mut problems = Vec::new();
    if suite.name.trim().is_empty() {
        problems.push("Suite name is required.".to_string());
    }
    if suite.runs < 1 {
        problems.push("Runs must be at least 1.".to_string());
    }
    if suite.warmup < 0 {
        problems.push("Warm-up runs cannot be negative.".to_string());
    }
    if suite.cases.is_empty() {
        problems.push("Add at least one case.".to_string());
    }
    let mut seen = HashSet::new();
    for (i, case) in suite.cases.iter().enumerate() {
        let label = if case.name.trim().is_empty() {
            format!("Case {}", i + 1)
        } else {
            format!("Case \"{}\"", case.name.trim())
        };
        if case.name.trim().is_empty() {
            problems.push(format!("{label}: name is required."));
        } else if !seen.insert(case.name.trim().to_string()) {
            problems.push(format!("{label}: name is used more than once."));
        }
        if case.command.trim().is_empty() {
            problems.push(format!("{label}: command is required."));
        }
        if let Some(budget) = case.budget_percent
            && (!budget.is_finite() || budget <= 0.0)
        {
            problems.push(format!("{label}: budget must be a number above 0."));
        }
    }
    problems
}

pub fn load_suite(conn: &Connection, id: &str) -> Result<Suite, String> {
    let mut suite = conn
        .query_row(
            "SELECT id, name, description, runs, schema_version, created_at, updated_at, warmup,
                    baseline_run_id
             FROM suites WHERE id = ?1",
            [id],
            |r| {
                Ok(Suite {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    runs: r.get(3)?,
                    schema_version: r.get(4)?,
                    created_at: r.get(5)?,
                    updated_at: r.get(6)?,
                    warmup: r.get(7)?,
                    baseline_run_id: r.get(8)?,
                    cases: Vec::new(),
                })
            },
        )
        .optional()
        .map_err(sql_err)?
        .ok_or_else(|| "Suite not found.".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, command, setup_command, cleanup_command, working_directory, enabled,
                    budget_percent
             FROM cases WHERE suite_id = ?1 ORDER BY position",
        )
        .map_err(sql_err)?;
    suite.cases = stmt
        .query_map([id], |r| {
            Ok(Case {
                id: r.get(0)?,
                name: r.get(1)?,
                command: r.get(2)?,
                setup_command: r.get(3)?,
                cleanup_command: r.get(4)?,
                working_directory: r.get(5)?,
                enabled: r.get::<_, i64>(6)? != 0,
                budget_percent: r.get(7)?,
            })
        })
        .map_err(sql_err)?
        .collect::<Result<_, _>>()
        .map_err(sql_err)?;
    Ok(suite)
}

pub fn list_suites(conn: &Connection) -> Result<Vec<SuiteSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, s.description, s.updated_at,
                    (SELECT COUNT(*) FROM cases c WHERE c.suite_id = s.id)
             FROM suites s ORDER BY s.updated_at DESC, s.name",
        )
        .map_err(sql_err)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(SuiteSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                updated_at: r.get(3)?,
                case_count: r.get(4)?,
            })
        })
        .map_err(sql_err)?
        .collect::<Result<_, _>>()
        .map_err(sql_err)?;
    Ok(rows)
}

/// Creates (empty id) or updates a suite, replacing its cases atomically.
pub fn save_suite(conn: &Connection, mut suite: Suite) -> Result<Suite, String> {
    suite.name = suite.name.trim().to_string();
    suite.description = suite.description.trim().to_string();
    for c in &mut suite.cases {
        c.name = c.name.trim().to_string();
        c.command = c.command.trim().to_string();
        c.setup_command = none_if_blank(&c.setup_command);
        c.cleanup_command = none_if_blank(&c.cleanup_command);
        c.working_directory = none_if_blank(&c.working_directory);
    }
    let problems = validate(&suite);
    if !problems.is_empty() {
        return Err(problems.join("\n"));
    }

    let tx = conn.unchecked_transaction().map_err(sql_err)?;
    let now = now_iso(&tx)?;
    let id = if suite.id.is_empty() {
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO suites (id, name, description, runs, warmup, schema_version, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![id, suite.name, suite.description, suite.runs, suite.warmup, SCHEMA_VERSION, now],
        )
        .map_err(sql_err)?;
        id
    } else {
        let changed = tx
            .execute(
                "UPDATE suites SET name = ?2, description = ?3, runs = ?4, warmup = ?5, updated_at = ?6 WHERE id = ?1",
                params![suite.id, suite.name, suite.description, suite.runs, suite.warmup, now],
            )
            .map_err(sql_err)?;
        if changed == 0 {
            return Err("Suite not found.".to_string());
        }
        tx.execute("DELETE FROM cases WHERE suite_id = ?1", [&suite.id])
            .map_err(sql_err)?;
        suite.id.clone()
    };

    for (pos, c) in suite.cases.iter().enumerate() {
        let case_id = if c.id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            c.id.clone()
        };
        tx.execute(
            "INSERT INTO cases (id, suite_id, position, name, command, setup_command,
                                cleanup_command, working_directory, enabled, budget_percent)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                case_id,
                id,
                pos as i64,
                c.name,
                c.command,
                c.setup_command,
                c.cleanup_command,
                c.working_directory,
                c.enabled as i64,
                c.budget_percent
            ],
        )
        .map_err(sql_err)?;
    }
    tx.commit().map_err(sql_err)?;
    load_suite(conn, &id)
}

pub fn duplicate_suite(conn: &Connection, id: &str) -> Result<Suite, String> {
    let mut copy = load_suite(conn, id)?;
    copy.id = String::new();
    copy.baseline_run_id = None;
    copy.name = format!("{} (copy)", copy.name);
    for c in &mut copy.cases {
        c.id = String::new();
    }
    save_suite(conn, copy)
}

/// Pins `run_id` as the suite's baseline, or clears it with None. The run must belong to the
/// suite and have results, otherwise comparisons against it would have nothing to compare.
pub fn set_baseline(
    conn: &Connection,
    suite_id: &str,
    run_id: Option<&str>,
) -> Result<Suite, String> {
    if let Some(run_id) = run_id {
        let run = conn
            .query_row(
                "SELECT suite_id, raw_output IS NOT NULL FROM runs WHERE id = ?1",
                [run_id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)),
            )
            .optional()
            .map_err(sql_err)?;
        match run {
            None => return Err("Run not found.".to_string()),
            Some((owner, _)) if owner != suite_id => {
                return Err("That run belongs to a different suite.".to_string());
            }
            Some((_, false)) => {
                return Err("That run has no results to compare against.".to_string());
            }
            Some(_) => {}
        }
    }
    let changed = conn
        .execute(
            "UPDATE suites SET baseline_run_id = ?2 WHERE id = ?1",
            params![suite_id, run_id],
        )
        .map_err(sql_err)?;
    if changed == 0 {
        return Err("Suite not found.".to_string());
    }
    load_suite(conn, suite_id)
}

pub fn delete_suite(conn: &Connection, id: &str) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM suites WHERE id = ?1", [id])
        .map_err(sql_err)?;
    if changed == 0 {
        return Err("Suite not found.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn list_suites_cmd(db: State<'_, Db>) -> Result<Vec<SuiteSummary>, String> {
    db.with(list_suites)
}

#[tauri::command]
pub fn get_suite(db: State<'_, Db>, id: String) -> Result<Suite, String> {
    db.with(|c| load_suite(c, &id))
}

#[tauri::command]
pub fn save_suite_cmd(db: State<'_, Db>, suite: Suite) -> Result<Suite, String> {
    db.with(|c| save_suite(c, suite))
}

#[tauri::command]
pub fn duplicate_suite_cmd(db: State<'_, Db>, id: String) -> Result<Suite, String> {
    db.with(|c| duplicate_suite(c, &id))
}

#[tauri::command]
pub fn set_baseline_cmd(
    db: State<'_, Db>,
    suite_id: String,
    run_id: Option<String>,
) -> Result<Suite, String> {
    db.with(|c| set_baseline(c, &suite_id, run_id.as_deref()))
}

#[tauri::command]
pub fn delete_suite_cmd(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.with(|c| delete_suite(c, &id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::memory;

    fn case(name: &str, command: &str) -> Case {
        Case {
            id: String::new(),
            name: name.into(),
            command: command.into(),
            setup_command: Some("  ".into()),
            cleanup_command: None,
            working_directory: None,
            enabled: true,
            budget_percent: None,
        }
    }

    fn suite(name: &str, cases: Vec<Case>) -> Suite {
        Suite {
            id: String::new(),
            name: name.into(),
            description: String::new(),
            runs: 10,
            warmup: 1,
            baseline_run_id: None,
            schema_version: 0,
            created_at: String::new(),
            updated_at: String::new(),
            cases,
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

    fn case() -> Case {
        Case {
            id: String::new(),
            name: "a".into(),
            command: "echo".into(),
            setup_command: None,
            cleanup_command: None,
            working_directory: None,
            enabled: true,
            budget_percent: None,
        }
    }

    fn make_suite(conn: &Connection, name: &str) -> Suite {
        save_suite(
            conn,
            Suite {
                id: String::new(),
                name: name.into(),
                description: String::new(),
                runs: 3,
                warmup: 0,
                baseline_run_id: None,
                schema_version: 0,
                created_at: String::new(),
                updated_at: String::new(),
                cases: vec![case()],
            },
        )
        .unwrap()
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

    fn suite_with_budget(budget: Option<f64>) -> Suite {
        Suite {
            id: String::new(),
            name: "S".into(),
            description: String::new(),
            runs: 3,
            warmup: 0,
            baseline_run_id: None,
            schema_version: 0,
            created_at: String::new(),
            updated_at: String::new(),
            cases: vec![Case {
                id: String::new(),
                name: "a".into(),
                command: "echo".into(),
                setup_command: None,
                cleanup_command: None,
                working_directory: None,
                enabled: true,
                budget_percent: budget,
            }],
        }
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
