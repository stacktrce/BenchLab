use serde::Serialize;
use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
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

/// Kills hyperfine and everything it started. Killing only hyperfine would leave the
/// benchmarked command (a grandchild, behind the shell) running.
fn kill_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(unix)]
    {
        // The child leads its own process group (see `exec`), so a negative pid reaches all of it.
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", child.id())])
            .output();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// `--name=value` as one argument. Passed as two, a value that starts with "-" (a case called
/// "-fast", a hook such as "--version") is parsed as another option and hyperfine refuses to run.
fn flag(name: &str, value: &std::ffi::OsStr) -> std::ffi::OsString {
    let mut arg = std::ffi::OsString::from(format!("--{name}="));
    arg.push(value);
    arg
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
    cmd.stdin(Stdio::null())
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

    // Drain pipes on threads so a full pipe buffer cannot stall the child.
    let drain = |mut pipe: Box<dyn Read + Send>| {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = pipe.read_to_string(&mut buf);
            buf
        })
    };
    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        kill_tree(&mut child);
        return Err("Could not capture hyperfine's output".to_string());
    };
    let out_h = drain(Box::new(stdout));
    let err_h = drain(Box::new(stderr));

    let started = Instant::now();
    let mut cancelled = false;
    let (status, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (Some(status), false),
            Ok(None) if job.cancel.is_some_and(|c| c.load(Ordering::SeqCst)) => {
                kill_tree(&mut child);
                cancelled = true;
                break (None, false);
            }
            Ok(None) if started.elapsed() >= job.timeout => {
                kill_tree(&mut child);
                break (None, true);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(format!("Failed waiting for hyperfine: {e}")),
        }
    };

    let stdout = out_h.join().unwrap_or_default();
    let stderr = err_h.join().unwrap_or_default();
    let json = std::fs::read_to_string(&json_path).ok();
    let _ = std::fs::remove_file(&json_path);

    Ok(RunOutput {
        stdout,
        stderr,
        exit_code: status.and_then(|s| s.code()),
        json,
        timed_out,
        cancelled,
    })
}
