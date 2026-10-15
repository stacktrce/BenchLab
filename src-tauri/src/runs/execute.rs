use super::events::{RunEvent, RunSink};
use super::model::{CANCELLED_MESSAGE, SuiteOutcome};
use crate::git;
use crate::hyperfine::{self, Job};
use crate::logs::{LogChunk, LogStream};
use crate::suites::{Case, Suite};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Per-case limit for suite runs. Real benchmarks outlast the 30 s quick-run default.
const SUITE_CASE_TIMEOUT_SECS: u64 = 600;

enum CaseEnd {
    Done(Vec<serde_json::Value>),
    /// Why it failed, worded for the user.
    Failed(String),
    Cancelled,
}

/// Runs one case with its own hyperfine process and keeps hyperfine's output as its log.
fn run_case(
    hyperfine_path: &std::path::Path,
    suite: &Suite,
    case: &Case,
    cancel: &AtomicBool,
    logs: &mut Vec<LogChunk>,
) -> CaseEnd {
    let job = Job {
        name: Some(&case.name),
        command: &case.command,
        setup: case.setup_command.as_deref(),
        cleanup: case.cleanup_command.as_deref(),
        working_dir: case.working_directory.as_deref(),
        runs: Some(suite.runs as u32),
        warmup: Some(suite.warmup as u32),
        timeout: Duration::from_secs(SUITE_CASE_TIMEOUT_SECS),
        cancel: Some(cancel),
        show_output: false,
    };
    let out = match hyperfine::exec(hyperfine_path, &job) {
        Ok(o) => o,
        Err(e) => return CaseEnd::Failed(e),
    };
    logs.push(LogChunk {
        case: case.name.clone(),
        stream: LogStream::Hyperfine,
        body: hyperfine_log(&out.stdout, &out.stderr),
        truncated: false,
    });
    if out.cancelled {
        return CaseEnd::Cancelled;
    }
    if out.timed_out {
        return CaseEnd::Failed(format!(
            "timed out after {SUITE_CASE_TIMEOUT_SECS}s and was killed."
        ));
    }
    let parsed = out
        .json
        .as_deref()
        .and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok())
        .and_then(|v| v.get("results").and_then(|r| r.as_array().cloned()))
        .filter(|r| !r.is_empty());
    match (parsed, out.failure) {
        (Some(results), None) => CaseEnd::Done(results),
        (_, failure) => {
            CaseEnd::Failed(failure.unwrap_or_else(|| "hyperfine produced no results.".into()))
        }
    }
}

/// hyperfine's report (stdout) followed by its warnings and errors (stderr).
fn hyperfine_log(stdout: &str, stderr: &str) -> String {
    [stdout.trim_end(), stderr.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(
            "

",
        )
}

/// Blocking: runs each enabled case with its own hyperfine process so per-case
/// setup/cleanup/working directory apply, then merges the result arrays.
pub(super) fn execute_suite(
    hyperfine_path: &std::path::Path,
    suite: &Suite,
    cancel: &AtomicBool,
    sink: &dyn RunSink,
) -> SuiteOutcome {
    // Captured before anything runs: it must describe the code the benchmarks measured.
    let git = git::capture_all(
        suite
            .cases
            .iter()
            .filter(|c| c.enabled)
            .filter_map(|c| c.working_directory.as_deref()),
    );
    let mut outcome = SuiteOutcome {
        results: Vec::new(),
        errors: Vec::new(),
        case_count: 0,
        git,
        logs: Vec::new(),
    };
    let enabled: Vec<&Case> = suite.cases.iter().filter(|c| c.enabled).collect();
    let total = enabled.len();
    sink.emit(RunEvent::Started {
        suite_id: suite.id.clone(),
        total,
    });
    for (index, case) in enabled.into_iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            outcome.errors.push(CANCELLED_MESSAGE.to_string());
            break;
        }
        outcome.case_count += 1;
        sink.emit(RunEvent::CaseStarted {
            index,
            total,
            name: case.name.clone(),
        });
        let end = run_case(hyperfine_path, suite, case, cancel, &mut outcome.logs);
        let (ok, message) = match &end {
            CaseEnd::Done(_) => (true, None),
            CaseEnd::Failed(why) => (false, Some(why.clone())),
            CaseEnd::Cancelled => (false, Some("Cancelled.".to_string())),
        };
        sink.emit(RunEvent::CaseFinished { index, ok, message });
        match end {
            CaseEnd::Done(results) => outcome.results.extend(results),
            CaseEnd::Failed(why) => outcome.errors.push(format!("\"{}\": {why}", case.name)),
            CaseEnd::Cancelled => {
                outcome.errors.push(CANCELLED_MESSAGE.to_string());
                break;
            }
        }
    }
    outcome
}

#[cfg(test)]
mod tests;
