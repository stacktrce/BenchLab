use super::model::{Case, SCHEMA_VERSION, Suite, SuiteSummary};
use super::validate::validate;
use crate::db::{now_iso, sql_err};
use rusqlite::{Connection, OptionalExtension, params};

fn none_if_blank(v: &Option<String>) -> Option<String> {
    v.as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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

#[cfg(test)]
mod tests;
