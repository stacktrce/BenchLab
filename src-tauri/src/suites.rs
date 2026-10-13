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
    }
    problems
}

pub fn load_suite(conn: &Connection, id: &str) -> Result<Suite, String> {
    let mut suite = conn
        .query_row(
            "SELECT id, name, description, runs, schema_version, created_at, updated_at, warmup
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
                    cases: Vec::new(),
                })
            },
        )
        .optional()
        .map_err(sql_err)?
        .ok_or_else(|| "Suite not found.".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, command, setup_command, cleanup_command, working_directory, enabled
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
                                cleanup_command, working_directory, enabled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                case_id,
                id,
                pos as i64,
                c.name,
                c.command,
                c.setup_command,
                c.cleanup_command,
                c.working_directory,
                c.enabled as i64
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
    copy.name = format!("{} (copy)", copy.name);
    for c in &mut copy.cases {
        c.id = String::new();
    }
    save_suite(conn, copy)
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
        }
    }

    fn suite(name: &str, cases: Vec<Case>) -> Suite {
        Suite {
            id: String::new(),
            name: name.into(),
            description: String::new(),
            runs: 10,
            warmup: 1,
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
