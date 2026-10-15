//! Builders and guards shared by the Rust tests.

use crate::hyperfine;
use crate::runs::SuiteOutcome;
use crate::suites::{Case, Suite};
use std::path::PathBuf;
use std::process::Command;

/// An enabled case with no hooks, directory or budget. Override fields with struct update syntax:
/// `Case { budget_percent: Some(5.0), ..case("a") }`.
pub fn case(name: &str) -> Case {
    Case {
        id: String::new(),
        name: name.into(),
        command: "echo hi".into(),
        setup_command: None,
        cleanup_command: None,
        working_directory: None,
        enabled: true,
        budget_percent: None,
    }
}

/// An unsaved suite (empty ids and timestamps) of three runs and no warm-up.
pub fn suite(name: &str, cases: Vec<Case>) -> Suite {
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
        cases,
    }
}

/// The hyperfine these tests drive. Tests that need it return early when it is not installed.
pub fn real_hyperfine() -> Option<PathBuf> {
    hyperfine::locate_hyperfine().ok()
}

/// Tests that build real repositories return early when git is not installed.
pub fn git_available() -> bool {
    Command::new("git").arg("--version").output().is_ok()
}

/// A run outcome with `results` completed cases and `errors` failed ones.
pub fn outcome(results: usize, errors: usize) -> SuiteOutcome {
    SuiteOutcome {
        results: (0..results)
            .map(|i| serde_json::json!({ "command": format!("c{i}") }))
            .collect(),
        errors: (0..errors).map(|i| format!("e{i}")).collect(),
        case_count: (results + errors) as i64,
        git: Vec::new(),
        logs: Vec::new(),
    }
}
