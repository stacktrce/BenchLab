pub mod commands;
mod diagnose;
mod events;
mod execute;
mod model;
mod series;
mod store;

pub use model::SuiteOutcome;
pub use series::{backfill_run_cases, index_run};
#[cfg(test)]
pub use store::list_runs;

/// Records `outcome` as a run of `suite` through the normal insert path.
#[cfg(test)]
pub fn insert_run_for_tests(
    conn: &rusqlite::Connection,
    suite: &crate::suites::Suite,
    outcome: &SuiteOutcome,
) -> model::RunDetail {
    store::insert_run(
        conn,
        suite,
        "2026-01-01T00:00:00.000Z",
        "hyperfine 1.20.0",
        outcome,
    )
    .unwrap()
}
