use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

/// Ordered migrations. Index + 1 is the `user_version` after applying it.
/// Never edit an applied entry; append a new one.
const MIGRATIONS: &[&str] = &[
    "
    CREATE TABLE suites (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        description    TEXT NOT NULL DEFAULT '',
        runs           INTEGER NOT NULL DEFAULT 10 CHECK (runs >= 1),
        schema_version INTEGER NOT NULL DEFAULT 1,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
    );
    CREATE TABLE cases (
        id                TEXT PRIMARY KEY,
        suite_id          TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
        position          INTEGER NOT NULL,
        name              TEXT NOT NULL,
        command           TEXT NOT NULL,
        setup_command     TEXT,
        cleanup_command   TEXT,
        working_directory TEXT,
        enabled           INTEGER NOT NULL DEFAULT 1,
        UNIQUE (suite_id, name)
    );
    CREATE INDEX idx_cases_suite ON cases(suite_id, position);
    CREATE TABLE runs (
        id           TEXT PRIMARY KEY,
        suite_id     TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
        suite_name   TEXT NOT NULL,
        started_at   TEXT NOT NULL,
        finished_at  TEXT NOT NULL,
        status       TEXT NOT NULL CHECK (status IN ('completed', 'partial', 'failed')),
        tool_version TEXT NOT NULL,
        case_count   INTEGER NOT NULL,
        error        TEXT,
        raw_output   TEXT
    );
    CREATE INDEX idx_runs_suite ON runs(suite_id, started_at DESC);
    ",
    // v2: warm-up runs per case (existing suites keep 0 so their history stays comparable).
    "ALTER TABLE suites ADD COLUMN warmup INTEGER NOT NULL DEFAULT 0 CHECK (warmup >= 0);",
    // v3: suite configuration as it was when the run happened. NULL for runs recorded earlier.
    "ALTER TABLE runs ADD COLUMN config_json TEXT;",
    // v4: git state of the case working directories when the run started, as JSON.
    // NULL for runs recorded earlier.
    "ALTER TABLE runs ADD COLUMN git_json TEXT;",
    // v5: the run a suite compares against by default. SET NULL keeps the suite valid if the run goes.
    "ALTER TABLE suites ADD COLUMN baseline_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL;",
    // v6: optional per-case regression budget, in percent slower than the baseline.
    "ALTER TABLE cases ADD COLUMN budget_percent REAL CHECK (budget_percent IS NULL OR budget_percent > 0);",
    // v7: each case's summary numbers per run, copied out of runs.raw_output so a case's history
    // can be read without parsing every stored run. Filled for old runs by backfill_run_cases.
    "CREATE TABLE run_cases (
        run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        case_name TEXT NOT NULL,
        mean      REAL NOT NULL,
        stddev    REAL,
        median    REAL NOT NULL,
        min       REAL NOT NULL,
        max       REAL NOT NULL,
        samples   INTEGER NOT NULL,
        PRIMARY KEY (run_id, case_name)
    );
    CREATE INDEX idx_run_cases_name ON run_cases(case_name, run_id);",
];

pub struct Db(Mutex<Connection>);

impl Db {
    pub fn new(conn: Connection) -> Self {
        Db(Mutex::new(conn))
    }

    pub fn with<T>(&self, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
        let guard = self
            .0
            .lock()
            .map_err(|_| "Database lock poisoned".to_string())?;
        f(&guard)
    }
}

pub fn sql_err(e: rusqlite::Error) -> String {
    format!("Database error: {e}")
}

pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create data dir: {e}"))?;
    }
    let conn = Connection::open(path).map_err(sql_err)?;
    init(&conn)?;
    Ok(conn)
}

pub fn init(conn: &Connection) -> Result<(), String> {
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(sql_err)?;
    migrate(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let current: usize = conn
        .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
        .map_err(sql_err)? as usize;
    if current > MIGRATIONS.len() {
        return Err(format!(
            "Database is from a newer BenchLab (schema {current}, this build knows {})",
            MIGRATIONS.len()
        ));
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.unchecked_transaction().map_err(sql_err)?;
        tx.execute_batch(sql).map_err(sql_err)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)
            .map_err(sql_err)?;
        tx.commit().map_err(sql_err)?;
    }
    Ok(())
}

pub fn now_iso(conn: &Connection) -> Result<String, String> {
    conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |r| {
        r.get(0)
    })
    .map_err(sql_err)
}

#[cfg(test)]
pub fn memory() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    init(&conn).unwrap();
    conn
}

#[cfg(test)]
pub fn migration_sql(index: usize) -> &'static str {
    MIGRATIONS[index]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_apply_once_and_are_idempotent() {
        let conn = memory();
        init(&conn).unwrap();
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v as usize, MIGRATIONS.len());
    }

    #[test]
    fn rejects_database_from_newer_build() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 999i64).unwrap();
        assert!(init(&conn).unwrap_err().contains("newer"));
    }
}
