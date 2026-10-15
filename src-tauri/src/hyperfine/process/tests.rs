use super::*;
use crate::testing::real_hyperfine;

/// A benchmarked command may leave a background process behind, such as a server it started. On
/// Windows that process inherits hyperfine's output pipes, so waiting for them to close would
/// block until it exits, however long that is.
#[test]
fn a_background_process_left_behind_does_not_hold_the_run_up() {
    let Some(hyperfine) = real_hyperfine() else {
        return;
    };
    let command = if cfg!(windows) {
        "start /b ping -n 31 127.0.0.1"
    } else {
        "sleep 30 &"
    };
    let started = Instant::now();
    let out = exec(
        &hyperfine,
        &Job {
            name: None,
            command,
            setup: None,
            cleanup: None,
            working_dir: None,
            runs: Some(1),
            warmup: None,
            timeout: Duration::from_secs(60),
            cancel: None,
            show_output: false,
        },
    )
    .unwrap();
    assert!(
        started.elapsed() < Duration::from_secs(20),
        "the run waited {:?} for a leftover process",
        started.elapsed()
    );
    assert_eq!(out.exit_code, Some(0));
    assert!(out.json.is_some(), "the results must still be returned");
}
