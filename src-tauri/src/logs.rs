//! Per-case run logs. Bodies are capped so a chatty command cannot grow the database without
//! bound: a line, a case and a whole run each have a limit, and a log that hit one says so.

use crate::db::sql_err;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

pub const LINE_CAP_CHARS: usize = 4_000;
pub const CASE_CAP_BYTES: usize = 256 * 1024;
pub const RUN_CAP_BYTES: usize = 2 * 1024 * 1024;
const LINE_CUT_MARK: &str = "…[line cut]";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LogStream {
    /// hyperfine's own report and errors for the case.
    Hyperfine,
    /// The benchmarked command's output, when the suite captures it.
    Command,
}

impl LogStream {
    fn as_str(self) -> &'static str {
        match self {
            LogStream::Hyperfine => "hyperfine",
            LogStream::Command => "command",
        }
    }

    fn parse(s: &str) -> Self {
        if s == "command" {
            LogStream::Command
        } else {
            LogStream::Hyperfine
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogChunk {
    pub case: String,
    pub stream: LogStream,
    pub body: String,
    /// Some of the text was cut to stay under a cap.
    pub truncated: bool,
}

/// The largest prefix of `s` that fits in `max_bytes` without splitting a character.
fn prefix(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Cuts lines longer than `max_line_chars` (marking each), then the whole text at `max_bytes`.
/// The flag says whether anything was cut.
pub fn cap(text: &str, max_bytes: usize, max_line_chars: usize) -> (String, bool) {
    let mut cut = false;
    let lines: Vec<String> = text
        .split('\n')
        .map(|line| match line.char_indices().nth(max_line_chars) {
            Some((at, _)) => {
                cut = true;
                format!("{}{LINE_CUT_MARK}", &line[..at])
            }
            None => line.to_string(),
        })
        .collect();
    let joined = lines.join("\n");
    let kept = prefix(&joined, max_bytes);
    cut |= kept.len() < joined.len();
    (kept.to_string(), cut)
}

/// Stores a run's logs in order, applying the per-case cap and then the per-run cap. Once the
/// run's budget is spent, later logs are kept as empty bodies marked as truncated.
pub fn store_logs(conn: &Connection, run_id: &str, chunks: &[LogChunk]) -> Result<(), String> {
    let mut left = RUN_CAP_BYTES;
    for chunk in chunks {
        let (capped, case_cut) = cap(&chunk.body, CASE_CAP_BYTES, LINE_CAP_CHARS);
        let body = prefix(&capped, left);
        let truncated = chunk.truncated || case_cut || body.len() < capped.len();
        left -= body.len();
        conn.execute(
            "INSERT OR REPLACE INTO run_logs (run_id, case_name, stream, body, truncated)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![run_id, chunk.case, chunk.stream.as_str(), body, truncated],
        )
        .map_err(sql_err)?;
    }
    Ok(())
}

/// A run's logs in the order the cases ran.
pub fn run_logs(conn: &Connection, run_id: &str) -> Result<Vec<LogChunk>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT case_name, stream, body, truncated FROM run_logs
             WHERE run_id = ?1 ORDER BY rowid",
        )
        .map_err(sql_err)?;
    stmt.query_map([run_id], |r| {
        Ok(LogChunk {
            case: r.get(0)?,
            stream: LogStream::parse(&r.get::<_, String>(1)?),
            body: r.get(2)?,
            truncated: r.get(3)?,
        })
    })
    .map_err(sql_err)?
    .collect::<Result<_, _>>()
    .map_err(sql_err)
}

#[cfg(test)]
mod tests;
