//! Locating and running hyperfine. Commands reach hyperfine as single argv entries;
//! we never build shell strings ourselves (hyperfine runs them in its own shell).

use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const DEFAULT_TIMEOUT_SECS: u64 = 30;
const HYPERFINE_NAME: &str = if cfg!(windows) {
    "hyperfine.exe"
} else {
    "hyperfine"
};

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

/// PATH entries from the Windows registry (user + machine). A process started before an
/// installer edited PATH (e.g. an IDE-launched dev server) never sees the new entries.
#[cfg(windows)]
fn registry_path_dirs() -> Vec<PathBuf> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut dirs = Vec::new();
    for key in [
        "HKCU\\Environment",
        "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
    ] {
        let Ok(out) = Command::new("reg")
            .args(["query", key, "/v", "Path"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        else {
            continue;
        };
        // Line format: "    Path    REG_(EXPAND_)SZ    value"
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            let Some((_, rest)) = line.trim().split_once("REG_") else {
                continue;
            };
            let Some((_, value)) = rest.split_once(char::is_whitespace) else {
                continue;
            };
            for part in value.trim().split(';').filter(|p| !p.is_empty()) {
                dirs.push(PathBuf::from(expand_env(part)));
            }
        }
    }
    dirs
}

#[cfg(windows)]
fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                let name = &after[..end];
                match std::env::var(name) {
                    Ok(v) => out.push_str(&v),
                    Err(_) => {
                        out.push('%');
                        out.push_str(name);
                        out.push('%');
                    }
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(not(windows))]
fn registry_path_dirs() -> Vec<PathBuf> {
    Vec::new()
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// Path given in BENCHLAB_HYPERFINE.
    Override,
    /// The sidecar shipped next to the app executable.
    Bundled,
    /// Found on the system PATH.
    System,
}

pub const OVERRIDE_ENV: &str = "BENCHLAB_HYPERFINE";

/// Resolution order: explicit override, bundled sidecar, system PATH. Pure so it can be tested.
fn resolve(
    override_path: Option<PathBuf>,
    bundled_dir: Option<PathBuf>,
    search_dirs: Vec<PathBuf>,
) -> Result<(PathBuf, Source), String> {
    if let Some(p) = override_path {
        return if p.is_file() {
            Ok((p, Source::Override))
        } else {
            Err(format!(
                "{OVERRIDE_ENV} points to a file that does not exist: {}",
                p.display()
            ))
        };
    }
    if let Some(dir) = bundled_dir {
        let candidate = dir.join(HYPERFINE_NAME);
        if candidate.is_file() {
            return Ok((candidate, Source::Bundled));
        }
    }
    search_dirs
        .into_iter()
        .map(|dir| dir.join(HYPERFINE_NAME))
        .find(|candidate| candidate.is_file())
        .map(|p| (p, Source::System))
        .ok_or_else(|| {
            "hyperfine was not found. BenchLab normally ships its own copy; reinstall it, or install hyperfine \
             from https://github.com/sharkdp/hyperfine#installation and make sure it is on PATH."
                .to_string()
        })
}

pub fn locate_with_source() -> Result<(PathBuf, Source), String> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let search: Vec<PathBuf> = std::env::split_paths(&path)
        .chain(registry_path_dirs())
        .collect();
    let bundled_dir = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(Path::to_path_buf));
    resolve(
        std::env::var_os(OVERRIDE_ENV).map(PathBuf::from),
        bundled_dir,
        search,
    )
}

pub fn locate_hyperfine() -> Result<PathBuf, String> {
    locate_with_source().map(|(p, _)| p)
}

pub fn tool_version(hyperfine: &Path) -> String {
    Command::new(hyperfine)
        .arg("--version")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
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

/// Blocking: runs hyperfine for one command, killing it after `job.timeout`.
pub fn exec(hyperfine: &Path, job: &Job) -> Result<RunOutput, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let json_path =
        std::env::temp_dir().join(format!("benchlab-{}-{}.json", std::process::id(), nanos));

    let mut cmd = Command::new(hyperfine);
    cmd.arg("--export-json").arg(&json_path);
    if let Some(n) = job.runs {
        cmd.arg("--runs").arg(n.to_string());
    }
    if let Some(n) = job.warmup.filter(|n| *n > 0) {
        cmd.arg("--warmup").arg(n.to_string());
    }
    if let Some(name) = job.name {
        cmd.arg("--command-name").arg(name);
    }
    if let Some(s) = job.setup {
        cmd.arg("--setup").arg(s);
    }
    if let Some(c) = job.cleanup {
        cmd.arg("--cleanup").arg(c);
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
    let out_h = drain(Box::new(child.stdout.take().expect("piped stdout")));
    let err_h = drain(Box::new(child.stderr.take().expect("piped stderr")));

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub path: String,
    pub source: Source,
    pub version: String,
}

#[tauri::command]
pub async fn find_hyperfine() -> Result<ToolInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (path, source) = locate_with_source()?;
        let version = tool_version(&path);
        Ok(ToolInfo {
            path: path.to_string_lossy().into_owned(),
            source,
            version,
        })
    })
    .await
    .map_err(|e| format!("Lookup failed: {e}"))?
}

/// Quick, unsaved single-command run. The frontend must confirm with the user first.
#[tauri::command]
pub async fn run_benchmark(
    command: String,
    working_dir: Option<String>,
    runs: Option<u32>,
    timeout_secs: Option<u64>,
    control: tauri::State<'_, RunControl>,
) -> Result<RunOutput, String> {
    if command.trim().is_empty() {
        return Err("Command is empty".into());
    }
    let hyperfine = locate_hyperfine()?;
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));
    let active = control.begin()?;
    let cancel = active.flag();
    tauri::async_runtime::spawn_blocking(move || {
        exec(
            &hyperfine,
            &Job {
                name: None,
                command: &command,
                setup: None,
                cleanup: None,
                working_dir: working_dir.as_deref(),
                runs,
                warmup: None,
                timeout,
                cancel: Some(&cancel),
            },
        )
    })
    .await
    .map_err(|e| format!("Benchmark task failed: {e}"))?
}

/// At most one benchmark runs at a time (parallel runs would distort each other's timings).
#[derive(Default)]
pub struct RunControl(std::sync::Mutex<Option<std::sync::Arc<AtomicBool>>>);

pub struct ActiveRun<'a> {
    control: &'a RunControl,
    flag: std::sync::Arc<AtomicBool>,
}

impl RunControl {
    pub fn begin(&self) -> Result<ActiveRun<'_>, String> {
        let mut slot = self.0.lock().map_err(|_| "Run lock poisoned".to_string())?;
        if slot.is_some() {
            return Err(
                "A benchmark is already running. Wait for it to finish or cancel it.".to_string(),
            );
        }
        let flag = std::sync::Arc::new(AtomicBool::new(false));
        *slot = Some(flag.clone());
        Ok(ActiveRun {
            control: self,
            flag,
        })
    }

    /// Returns true when a run was active.
    pub fn cancel(&self) -> bool {
        match self.0.lock().ok().and_then(|s| s.clone()) {
            Some(flag) => {
                flag.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }
}

impl ActiveRun<'_> {
    pub fn flag(&self) -> std::sync::Arc<AtomicBool> {
        self.flag.clone()
    }
}

impl Drop for ActiveRun<'_> {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.control.0.lock() {
            *slot = None;
        }
    }
}

#[tauri::command]
pub fn cancel_run(control: tauri::State<'_, RunControl>) -> bool {
    control.cancel()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn registry_path_is_readable_and_expanded() {
        let dirs = registry_path_dirs();
        assert!(!dirs.is_empty());
        assert!(dirs.iter().all(|d| !d.to_string_lossy().contains('%')));
    }
}

#[cfg(test)]
mod resolve_tests {
    use super::*;

    fn dir_with_binary(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("benchlab-resolve-{}-{tag}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(HYPERFINE_NAME), b"x").unwrap();
        dir
    }

    fn empty_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("benchlab-resolve-{}-{tag}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn override_wins_over_bundled_and_system() {
        let (bundled, system) = (dir_with_binary("b1"), dir_with_binary("s1"));
        let over = bundled.join(HYPERFINE_NAME);
        let (p, src) = resolve(Some(over.clone()), Some(bundled), vec![system]).unwrap();
        assert_eq!((p, src), (over, Source::Override));
    }

    #[test]
    fn broken_override_is_an_error_not_a_silent_fallback() {
        let system = dir_with_binary("s2");
        let err = resolve(Some(PathBuf::from("/nope/hyperfine")), None, vec![system]).unwrap_err();
        assert!(err.contains(OVERRIDE_ENV));
    }

    #[test]
    fn bundled_beats_system_and_system_is_the_fallback() {
        let (bundled, system) = (dir_with_binary("b3"), dir_with_binary("s3"));
        assert_eq!(
            resolve(None, Some(bundled), vec![system.clone()])
                .unwrap()
                .1,
            Source::Bundled
        );
        assert_eq!(
            resolve(None, Some(empty_dir("e3")), vec![system])
                .unwrap()
                .1,
            Source::System
        );
    }

    #[test]
    fn missing_everywhere_explains_what_to_do() {
        let err = resolve(None, Some(empty_dir("e4")), vec![empty_dir("e5")]).unwrap_err();
        assert!(err.contains("not found") && err.contains("github.com/sharkdp/hyperfine"));
    }

    #[test]
    fn the_real_bundled_sidecar_runs_when_present() {
        // tauri-build copies the sidecar next to the test/app executables in target/.
        let Some(exe_dir) = std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(Path::to_path_buf))
        else {
            return;
        };
        // Test binaries live in target/<profile>/deps; the sidecar is one level up.
        let Some(profile_dir) = exe_dir.parent() else {
            return;
        };
        let candidate = profile_dir.join(HYPERFINE_NAME);
        if candidate.is_file() {
            assert!(tool_version(&candidate).starts_with("hyperfine"));
        }
    }
}
