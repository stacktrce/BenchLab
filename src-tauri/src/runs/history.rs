//! The history page: searching runs across suites, annotating them and deleting them.

use super::model::RunRecord;
use super::store::{RECORD_COLUMN_COUNT, RECORD_COLUMNS, row_to_record};
use crate::db::sql_err;
use crate::git::GitInfo;
use rusqlite::{Connection, params, params_from_iter};
use serde::{Deserialize, Serialize};

pub const NOTE_MAX_CHARS: usize = 2_000;
pub const TAGS_MAX: usize = 20;
const TAG_MAX_CHARS: usize = 40;

/// Every field is optional; an absent field does not filter. `from` and `to` are UTC instants
/// in the stored format (`2026-10-05T23:00:00.000Z`), start included and end excluded: the
/// frontend turns the user's local days into them, because runs are stored in UTC.
#[derive(Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct RunFilter {
    pub suite_id: Option<String>,
    pub status: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    /// Matches suite name, branch, commit, note and tags, ignoring case. JSON keys never match.
    pub text: Option<String>,
    pub tag: Option<String>,
}

/// A run as the history table shows it: the record plus the code state it measured.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRow {
    #[serde(flatten)]
    pub record: RunRecord,
    /// Empty for runs from before git state was recorded.
    pub git: Vec<GitInfo>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    /// Matching runs in all pages.
    pub total: i64,
}

/// `text` for a LIKE pattern in which `%` and `_` match themselves.
fn like_literal(text: &str) -> String {
    // "!" is the ESCAPE character in the queries below; a backslash would need escaping twice.
    let escaped = text
        .replace('!', "!!")
        .replace('%', "!%")
        .replace('_', "!_");
    format!("%{escaped}%")
}

pub fn search_runs(
    conn: &Connection,
    filter: &RunFilter,
    limit: i64,
    offset: i64,
) -> Result<Page<HistoryRow>, String> {
    let blank = |v: &Option<String>| {
        v.as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
    };
    let text = blank(&filter.text).map(|t| like_literal(&t));
    let tag = blank(&filter.tag);
    let values = [
        blank(&filter.suite_id),
        blank(&filter.status),
        blank(&filter.from),
        blank(&filter.to),
        text,
        tag,
    ];
    let condition = "(?1 IS NULL OR suite_id = ?1)
        AND (?2 IS NULL OR status = ?2)
        AND (?3 IS NULL OR started_at >= ?3)
        AND (?4 IS NULL OR started_at < ?4)
        AND (?5 IS NULL OR suite_name LIKE ?5 ESCAPE '!' OR IFNULL(note, '') LIKE ?5 ESCAPE '!'
             OR EXISTS (SELECT 1 FROM json_each(runs.git_json) AS g
                        WHERE json_extract(g.value, '$.branch') LIKE ?5 ESCAPE '!'
                           OR json_extract(g.value, '$.commit') LIKE ?5 ESCAPE '!')
             OR EXISTS (SELECT 1 FROM json_each(runs.tags) AS t WHERE t.value LIKE ?5 ESCAPE '!'))
        AND (?6 IS NULL OR EXISTS (SELECT 1 FROM json_each(runs.tags) AS t WHERE t.value = ?6))";
    let total = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM runs WHERE {condition}"),
            params_from_iter(values.iter()),
            |r| r.get(0),
        )
        .map_err(sql_err)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {RECORD_COLUMNS}, git_json FROM runs WHERE {condition}
             ORDER BY started_at DESC LIMIT ?7 OFFSET ?8"
        ))
        .map_err(sql_err)?;
    let page = params_from_iter(
        values
            .iter()
            .map(|v| {
                v.clone()
                    .map(rusqlite::types::Value::Text)
                    .unwrap_or(rusqlite::types::Value::Null)
            })
            .chain([limit.clamp(1, 500).into(), offset.max(0).into()]),
    );
    let items = stmt
        .query_map(page, |r| {
            Ok(HistoryRow {
                record: row_to_record(r)?,
                git: r
                    .get::<_, Option<String>>(RECORD_COLUMN_COUNT)?
                    .and_then(|j| serde_json::from_str(&j).ok())
                    .unwrap_or_default(),
            })
        })
        .map_err(sql_err)?
        .collect::<Result<_, _>>()
        .map_err(sql_err)?;
    Ok(Page { items, total })
}

/// Sets a run's note and tags. Whitespace is trimmed, an empty note is removed, and empty or
/// repeated tags are dropped. The run's measurements are not touched.
pub fn set_run_meta(
    conn: &Connection,
    run_id: &str,
    note: Option<&str>,
    tags: &[String],
) -> Result<RunRecord, String> {
    let note = note.map(str::trim).filter(|n| !n.is_empty());
    if note.is_some_and(|n| n.chars().count() > NOTE_MAX_CHARS) {
        return Err(format!(
            "A note can have at most {NOTE_MAX_CHARS} characters."
        ));
    }
    let mut clean: Vec<String> = Vec::new();
    for tag in tags.iter().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        if tag.chars().count() > TAG_MAX_CHARS {
            return Err(format!(
                "A tag can have at most {TAG_MAX_CHARS} characters."
            ));
        }
        if !clean.iter().any(|t| t == tag) {
            clean.push(tag.to_string());
        }
    }
    if clean.len() > TAGS_MAX {
        return Err(format!("A run can have at most {TAGS_MAX} tags."));
    }
    let json = serde_json::to_string(&clean).map_err(|e| e.to_string())?;
    let changed = conn
        .execute(
            "UPDATE runs SET note = ?2, tags = ?3 WHERE id = ?1",
            params![run_id, note, json],
        )
        .map_err(sql_err)?;
    if changed == 0 {
        return Err("That run no longer exists.".into());
    }
    conn.query_row(
        &format!("SELECT {RECORD_COLUMNS} FROM runs WHERE id = ?1"),
        [run_id],
        row_to_record,
    )
    .map_err(sql_err)
}

/// Deletes runs with their per-case rows and logs, all or none. A suite whose pinned baseline is
/// deleted is left without one. Unknown ids are skipped; the count is of runs actually deleted.
pub fn delete_runs(conn: &Connection, ids: &[String]) -> Result<usize, String> {
    // Dropped without commit on an error, which rolls back the runs already deleted.
    let tx = conn.unchecked_transaction().map_err(sql_err)?;
    let mut deleted = 0;
    for id in ids {
        deleted += tx
            .execute("DELETE FROM runs WHERE id = ?1", [id])
            .map_err(sql_err)?;
    }
    tx.commit().map_err(sql_err)?;
    Ok(deleted)
}

#[cfg(test)]
mod tests;
