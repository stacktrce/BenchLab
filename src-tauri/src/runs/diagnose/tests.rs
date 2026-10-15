use super::*;
use crate::suites::Case;
use crate::testing::{case, real_hyperfine};
use std::sync::atomic::AtomicBool;

fn named(name: &str, command: &str) -> Case {
    Case {
        command: command.into(),
        ..case(name)
    }
}

#[test]
fn a_failing_command_returns_its_output_and_exit_code() {
    let Some(hf) = real_hyperfine() else {
        return;
    };
    let command = if cfg!(windows) {
        "echo to stdout & echo to stderr 1>&2 & exit 3"
    } else {
        "echo to stdout; echo to stderr 1>&2; exit 3"
    };
    let result = diagnose(&hf, &named("bad", command), &AtomicBool::new(false));
    assert_eq!(result.exit_code, Some(3), "{}", result.output);
    assert!(result.output.contains("to stdout"), "{}", result.output);
    assert!(
        result.output.contains("to stderr"),
        "the command's stderr is missing: {}",
        result.output
    );
    assert!(!result.timed_out && !result.cancelled);
}

#[test]
fn a_succeeding_command_reports_exit_code_zero() {
    let Some(hf) = real_hyperfine() else {
        return;
    };
    let result = diagnose(&hf, &named("ok", "echo fine"), &AtomicBool::new(false));
    assert_eq!(result.exit_code, Some(0), "{}", result.output);
    assert!(result.output.contains("fine"), "{}", result.output);
}

#[test]
fn a_failing_setup_command_is_reported() {
    let Some(hf) = real_hyperfine() else {
        return;
    };
    let with_setup = Case {
        setup_command: Some("exit 4".into()),
        ..named("s", "echo never")
    };
    let result = diagnose(&hf, &with_setup, &AtomicBool::new(false));
    assert_ne!(result.exit_code, Some(0));
    assert!(
        result.output.to_lowercase().contains("setup"),
        "{}",
        result.output
    );
}
