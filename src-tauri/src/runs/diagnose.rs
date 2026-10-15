//! Running a failed case once to see why it failed. hyperfine discards a command's output while
//! timing it, so this is a separate, untimed run that is never recorded as a benchmark.

use crate::hyperfine::{self, Job};
use crate::logs::{CASE_CAP_BYTES, LINE_CAP_CHARS, cap};
use crate::suites::Case;
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

const DIAGNOSE_TIMEOUT_SECS: u64 = 120;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiagnoseResult {
    /// The command's own exit code when hyperfine got as far as running it, else hyperfine's.
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub cancelled: bool,
    pub duration_seconds: f64,
    /// hyperfine's report with the command's stdout and stderr, capped like a run log.
    pub output: String,
    pub truncated: bool,
}

/// Blocking: runs `case` once, with its setup and cleanup, and returns everything it printed.
pub(super) fn diagnose(
    hyperfine_path: &std::path::Path,
    case: &Case,
    cancel: &AtomicBool,
) -> DiagnoseResult {
    let job = Job {
        name: Some(&case.name),
        command: &case.command,
        setup: case.setup_command.as_deref(),
        cleanup: case.cleanup_command.as_deref(),
        working_dir: case.working_directory.as_deref(),
        runs: Some(1),
        warmup: Some(0),
        timeout: Duration::from_secs(DIAGNOSE_TIMEOUT_SECS),
        cancel: Some(cancel),
        show_output: true,
    };
    let started = Instant::now();
    let out = match hyperfine::exec(hyperfine_path, &job) {
        Ok(out) => out,
        Err(e) => {
            return DiagnoseResult {
                exit_code: None,
                timed_out: false,
                cancelled: false,
                duration_seconds: started.elapsed().as_secs_f64(),
                output: e,
                truncated: false,
            };
        }
    };
    let command_exit = out
        .json
        .as_deref()
        .and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok())
        .and_then(|v| v["results"][0]["exit_codes"][0].as_i64())
        .and_then(|code| i32::try_from(code).ok());
    let text = [out.stdout.trim_end(), out.stderr.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(
            "

",
        );
    let (output, truncated) = cap(&text, CASE_CAP_BYTES, LINE_CAP_CHARS);
    DiagnoseResult {
        exit_code: command_exit.or(out.exit_code),
        timed_out: out.timed_out,
        cancelled: out.cancelled,
        duration_seconds: started.elapsed().as_secs_f64(),
        output,
        truncated,
    }
}

#[cfg(test)]
mod tests;
