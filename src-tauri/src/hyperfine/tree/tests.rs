use super::*;
use std::process::Stdio;
use std::time::{Duration, Instant};

/// How many processes have `marker` on their command line, so a test can tell whether a command it
/// started is still alive.
fn alive(marker: &str) -> usize {
    let output = if cfg!(windows) {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "(Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like '*{marker}*' -and $_.Name -like 'ping*' }} | Measure-Object).Count"
                ),
            ])
            .output()
    } else {
        Command::new("pgrep").args(["-fc", marker]).output()
    };
    output
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok())
        .unwrap_or(0)
}

/// A shell that runs a long command: the command is the shell's child, not the test's.
fn spawn_long(marker_secs: u32) -> Child {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/c", "ping", "-n", &marker_secs.to_string(), "127.0.0.1"]);
        c
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", &format!("sleep {marker_secs}")]);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            c.process_group(0);
        }
        c
    };
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn().unwrap()
}

fn wait_until(mut condition: impl FnMut() -> bool, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if condition() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    condition()
}

#[test]
fn killing_the_tree_stops_the_grandchild_not_just_the_child() {
    let marker = if cfg!(windows) { "-n 83" } else { "sleep 83" };
    let mut child = spawn_long(83);
    let tree = ProcessTree::contain(&child);
    assert!(
        wait_until(|| alive(marker) == 1, Duration::from_secs(10)),
        "the probe must see the command before it is killed, or this test proves nothing"
    );

    tree.kill(&mut child);

    assert!(
        wait_until(|| alive(marker) == 0, Duration::from_secs(10)),
        "the command survived the kill"
    );
    assert!(
        child.try_wait().unwrap().is_some(),
        "the child must be reaped"
    );
}

#[test]
fn killing_twice_or_after_exit_is_harmless() {
    let mut child = spawn_long(1);
    let tree = ProcessTree::contain(&child);
    child.wait().unwrap();
    tree.kill(&mut child);
    tree.kill(&mut child);
}

#[cfg(windows)]
#[test]
fn a_process_that_cannot_join_a_job_falls_back_to_taskkill() {
    let marker = "-n 85";
    let mut child = spawn_long(85);
    // No containment: the same code path as when creating or joining the job fails.
    let tree = ProcessTree { job: None };
    assert!(wait_until(|| alive(marker) == 1, Duration::from_secs(10)));
    tree.kill(&mut child);
    assert!(wait_until(|| alive(marker) == 0, Duration::from_secs(10)));
}
