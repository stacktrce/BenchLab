use super::*;
use crate::suites::Case;
use crate::testing::{case, git_available, real_hyperfine, suite};

#[test]
fn executes_real_hyperfine_per_case_and_isolates_failures() {
    let Some(hf) = real_hyperfine() else {
        return;
    };
    let named = |name: &str, command: &str| Case {
        command: command.into(),
        ..case(name)
    };
    let disabled = Case {
        enabled: false,
        ..named("skipped", "exit 1")
    };
    let with_hooks = Case {
        setup_command: Some("echo setup".into()),
        cleanup_command: Some("echo cleanup".into()),
        ..case("hooks")
    };
    let suite = Suite {
        runs: 2,
        warmup: 1,
        ..suite(
            "S",
            vec![case("good"), named("bad", "exit 3"), disabled, with_hooks],
        )
    };
    let out = execute_suite(&hf, &suite, &AtomicBool::new(false));
    assert_eq!(out.case_count, 3);
    assert_eq!(out.status(), "partial");
    let names: Vec<_> = out
        .results
        .iter()
        .map(|r| r["command"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["good", "hooks"]);
    assert_eq!(out.errors.len(), 1);
    assert!(out.errors[0].starts_with("\"bad\""), "{:?}", out.errors);
    assert!(
        out.errors[0].contains("The command exited with code 3"),
        "{:?}",
        out.errors
    );
    let logged: Vec<_> = out.logs.iter().map(|l| l.case.as_str()).collect();
    assert_eq!(logged, ["good", "bad", "hooks"]);
    assert!(
        out.logs[0].body.contains("Benchmark 1: good"),
        "{}",
        out.logs[0].body
    );
    assert!(
        out.logs[1].body.contains("non-zero exit code 3"),
        "{}",
        out.logs[1].body
    );
}

/// Cancelling must return quickly and leave nothing behind.
#[test]
fn cancelling_stops_the_whole_process_tree_quickly() {
    let Some(hf) = real_hyperfine() else {
        return;
    };
    let long = if cfg!(windows) {
        "ping -n 41 127.0.0.1"
    } else {
        "sleep 41"
    };
    let marker = if cfg!(windows) { "-n 41" } else { "sleep 41" };
    let named = |name: &str, command: &str| Case {
        command: command.into(),
        ..case(name)
    };
    let suite = suite("S", vec![named("long", long), case("never reached")]);
    let cancel = std::sync::Arc::new(AtomicBool::new(false));
    let flag = cancel.clone();
    let canceller = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        flag.store(true, Ordering::SeqCst);
    });
    let started = std::time::Instant::now();
    let out = execute_suite(&hf, &suite, &cancel);
    canceller.join().unwrap();

    assert!(
        started.elapsed() < Duration::from_secs(20),
        "cancel took {:?}",
        started.elapsed()
    );
    assert_eq!(out.errors, [CANCELLED_MESSAGE]);
    assert_eq!(out.case_count, 1, "second case must not start");
    assert!(out.results.is_empty());

    std::thread::sleep(Duration::from_millis(500));
    let survivors = if cfg!(windows) {
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", &format!(
                    "(Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like '*{marker}*' -and $_.Name -like 'ping*' }} | Measure-Object).Count")])
                .output()
        } else {
            std::process::Command::new("pgrep").args(["-fc", marker]).output()
        }
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    assert!(
        survivors == "0" || survivors.is_empty(),
        "benchmarked command survived: {survivors}"
    );
}

/// The state is captured when the run starts, so a change made to the repository after that
/// must not show up in the record.
#[test]
fn a_suite_run_records_the_git_state_of_its_working_directories() {
    let Some(hf) = real_hyperfine() else {
        return;
    };
    if !git_available() {
        return;
    }
    let git = |dir: &std::path::Path, args: &[&str]| {
        std::process::Command::new("git")
            .args([
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@example.com",
                "-c",
                "commit.gpgsign=false",
            ])
            .args(args)
            .current_dir(dir)
            .output()
    };
    let repo = std::env::temp_dir().join(format!("benchlab-run-git-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&repo);
    std::fs::create_dir_all(&repo).unwrap();
    git(&repo, &["init", "-q", "-b", "main"]).unwrap();
    std::fs::write(repo.join("f.txt"), "1").unwrap();
    git(&repo, &["add", "f.txt"]).unwrap();
    git(&repo, &["commit", "-q", "-m", "c"]).unwrap();
    let head = String::from_utf8(git(&repo, &["rev-parse", "HEAD"]).unwrap().stdout).unwrap();

    let in_dir = |name: &str, dir: Option<&str>| Case {
        working_directory: dir.map(Into::into),
        ..case(name)
    };
    let repo_dir = repo.to_str().unwrap();
    // two cases in one repo and one with no directory: one record, not three
    let suite = Suite {
        runs: 2,
        ..suite(
            "S",
            vec![
                in_dir("a", Some(repo_dir)),
                in_dir("b", Some(repo_dir)),
                in_dir("c", None),
            ],
        )
    };
    let out = execute_suite(&hf, &suite, &AtomicBool::new(false));
    assert_eq!(out.status(), "completed");
    assert_eq!(out.git.len(), 1);
    assert_eq!(out.git[0].commit, head.trim());
    assert!(!out.git[0].dirty);
    let _ = std::fs::remove_dir_all(repo);
}

/// Values that look like options must be passed as values: a case named "-fast" made
/// hyperfine reject the whole command line.
#[test]
fn option_like_names_and_hooks_are_passed_as_values() {
    let Some(hf) = real_hyperfine() else {
        return;
    };
    let hooked = Case {
        setup_command: Some("--version".into()),
        ..case("hooked")
    };
    let suite = Suite {
        runs: 2,
        ..suite(
            "S",
            vec![case("-fast"), case("--runs=99"), case("a=b c"), hooked],
        )
    };
    let out = execute_suite(&hf, &suite, &AtomicBool::new(false));
    let names: Vec<_> = out
        .results
        .iter()
        .map(|r| r["command"].as_str().unwrap())
        .collect();
    // setup "--version" is not a valid command, so only that case may fail
    assert_eq!(
        names,
        ["-fast", "--runs=99", "a=b c"],
        "errors: {:?}",
        out.errors
    );
    assert_eq!(
        out.results[1]["times"].as_array().unwrap().len(),
        2,
        "name must not change the run count"
    );
}
