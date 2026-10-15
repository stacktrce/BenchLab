use super::tree::ProcessTree;
use crate::console::without_window;
use serde::Serialize;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub json: Option<String>,
    pub timed_out: bool,
    pub cancelled: bool,
    /// Why hyperfine failed, in words a user can act on; None when it succeeded or was stopped.
    pub failure: Option<String>,
}

pub struct Job<'a> {
    pub name: Option<&'a str>,
    pub command: &'a str,
    pub setup: Option<&'a str>,
    pub cleanup: Option<&'a str>,
    pub working_dir: Option<&'a str>,
    pub runs: Option<u32>,
    pub warmup: Option<u32>,
    pub timeout: Duration,
    /// Set from another thread to stop the run early.
    pub cancel: Option<&'a AtomicBool>,
}

/// `--name=value` as one argument. Passed as two, a value that starts with "-" (a case called
/// "-fast", a hook such as "--version") is parsed as another option and hyperfine refuses to run.
fn flag(name: &str, value: &std::ffi::OsStr) -> std::ffi::OsString {
    let mut arg = std::ffi::OsString::from(format!("--{name}="));
    arg.push(value);
    arg
}

/// How long to keep collecting output after hyperfine has exited.
const DRAIN_GRACE: Duration = Duration::from_secs(2);

/// Reads a child's pipe on a thread so a full pipe buffer cannot stall the child, keeping what it
/// has read so far where `finish` can still get it.
struct Drain {
    collected: Arc<Mutex<Vec<u8>>>,
    thread: JoinHandle<()>,
}

impl Drain {
    fn start(mut pipe: impl Read + Send + 'static) -> Self {
        let collected = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&collected);
        let thread = std::thread::spawn(move || {
            let mut chunk = [0u8; 8192];
            while let Ok(n) = pipe.read(&mut chunk) {
                if n == 0 {
                    break;
                }
                if let Ok(mut buf) = sink.lock() {
                    buf.extend_from_slice(&chunk[..n]);
                }
            }
        });
        Self { collected, thread }
    }

    /// Waits until `deadline` for the pipe to close, then returns what was read. A background process
    /// the benchmarked command left behind inherits the pipe (always on Windows) and would keep it
    /// open for as long as it lives; its reader thread simply ends when that process does.
    fn finish(self, deadline: Instant) -> String {
        while !self.thread.is_finished() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        self.collected
            .lock()
            .map(|buf| String::from_utf8_lossy(&buf).into_owned())
            .unwrap_or_default()
    }
}

/// Blocking: call it from `spawn_blocking`, never on the async runtime.
pub fn exec(hyperfine: &Path, job: &Job) -> Result<RunOutput, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let json_path =
        std::env::temp_dir().join(format!("benchlab-{}-{}.json", std::process::id(), nanos));

    let mut cmd = Command::new(hyperfine);
    cmd.arg(flag("export-json", json_path.as_os_str()));
    if let Some(n) = job.runs {
        cmd.arg(flag("runs", n.to_string().as_ref()));
    }
    if let Some(n) = job.warmup.filter(|n| *n > 0) {
        cmd.arg(flag("warmup", n.to_string().as_ref()));
    }
    if let Some(name) = job.name {
        cmd.arg(flag("command-name", name.as_ref()));
    }
    if let Some(s) = job.setup {
        cmd.arg(flag("setup", s.as_ref()));
    }
    if let Some(c) = job.cleanup {
        cmd.arg(flag("cleanup", c.as_ref()));
    }
    cmd.arg("--").arg(job.command);
    if let Some(dir) = job.working_dir.filter(|d| !d.trim().is_empty()) {
        cmd.current_dir(dir);
    }
    without_window(&mut cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start hyperfine: {e}"))?;

    let tree = ProcessTree::contain(&child);
    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        tree.kill(&mut child);
        return Err("Could not capture hyperfine's output".to_string());
    };
    let out_h = Drain::start(stdout);
    let err_h = Drain::start(stderr);

    let started = Instant::now();
    let mut cancelled = false;
    let (status, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (Some(status), false),
            Ok(None) if job.cancel.is_some_and(|c| c.load(Ordering::SeqCst)) => {
                tree.kill(&mut child);
                cancelled = true;
                break (None, false);
            }
            Ok(None) if started.elapsed() >= job.timeout => {
                tree.kill(&mut child);
                break (None, true);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(format!("Failed waiting for hyperfine: {e}")),
        }
    };

    let drain_deadline = Instant::now() + DRAIN_GRACE;
    let stdout = out_h.finish(drain_deadline);
    let stderr = err_h.finish(drain_deadline);
    let json = std::fs::read_to_string(&json_path).ok();
    let _ = std::fs::remove_file(&json_path);

    let exit_code = status.and_then(|s| s.code());
    let failure = (!timed_out && !cancelled && exit_code != Some(0))
        .then(|| super::explain_failure(&stderr, exit_code));
    Ok(RunOutput {
        stdout,
        stderr,
        exit_code,
        json,
        timed_out,
        cancelled,
        failure,
    })
}

#[cfg(test)]
mod tests;
