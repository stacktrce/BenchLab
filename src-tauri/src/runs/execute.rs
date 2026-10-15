use super::model::{CANCELLED_MESSAGE, SuiteOutcome};
use crate::git;
use crate::hyperfine::{self, Job};
use crate::logs::{LogChunk, LogStream};
use crate::suites::Suite;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Per-case limit for suite runs. Real benchmarks outlast the 30 s quick-run default.
const SUITE_CASE_TIMEOUT_SECS: u64 = 600;

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
    for case in suite.cases.iter().filter(|c| c.enabled) {
        if cancel.load(Ordering::SeqCst) {
            outcome.errors.push(CANCELLED_MESSAGE.to_string());
            break;
        }
        outcome.case_count += 1;
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
        };
        let out = match hyperfine::exec(hyperfine_path, &job) {
            Ok(o) => o,
            Err(e) => {
                outcome.errors.push(format!("\"{}\": {e}", case.name));
                continue;
            }
        };
        outcome.logs.push(LogChunk {
            case: case.name.clone(),
            stream: LogStream::Hyperfine,
            body: hyperfine_log(&out.stdout, &out.stderr),
            truncated: false,
        });
        if out.cancelled {
            outcome.errors.push(CANCELLED_MESSAGE.to_string());
            break;
        }
        if out.timed_out {
            outcome.errors.push(format!(
                "\"{}\": timed out after {SUITE_CASE_TIMEOUT_SECS}s and was killed.",
                case.name
            ));
            continue;
        }
        let parsed = out
            .json
            .as_deref()
            .and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok())
            .and_then(|v| v.get("results").and_then(|r| r.as_array().cloned()))
            .filter(|r| !r.is_empty());
        match (parsed, out.failure) {
            (Some(results), None) => outcome.results.extend(results),
            (_, failure) => outcome.errors.push(format!(
                "\"{}\": {}",
                case.name,
                failure.unwrap_or_else(|| "hyperfine produced no results.".into())
            )),
        }
    }
    outcome
}

#[cfg(test)]
mod tests;
