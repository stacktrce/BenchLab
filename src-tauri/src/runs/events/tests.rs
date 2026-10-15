use super::*;
use crate::runs::execute::execute_suite;
use crate::suites::{Case, Suite};
use crate::testing::{case, real_hyperfine, suite};
use std::sync::atomic::AtomicBool;

fn named(name: &str, command: &str) -> Case {
    Case {
        command: command.into(),
        ..case(name)
    }
}

fn run(cases: Vec<Case>, cancel: &AtomicBool) -> Option<Vec<RunEvent>> {
    let hf = real_hyperfine()?;
    let suite = Suite {
        runs: 2,
        warmup: 0,
        ..suite("S", cases)
    };
    let sink = VecSink::default();
    execute_suite(&hf, &suite, cancel, &sink);
    Some(sink.events())
}

#[test]
fn emits_started_then_each_case_in_order() {
    let Some(events) = run(vec![case("a"), case("b")], &AtomicBool::new(false)) else {
        return;
    };
    assert_eq!(
        events,
        [
            RunEvent::Started {
                suite_id: String::new(),
                total: 2
            },
            RunEvent::CaseStarted {
                index: 0,
                total: 2,
                name: "a".into()
            },
            RunEvent::CaseFinished {
                index: 0,
                ok: true,
                message: None
            },
            RunEvent::CaseStarted {
                index: 1,
                total: 2,
                name: "b".into()
            },
            RunEvent::CaseFinished {
                index: 1,
                ok: true,
                message: None
            },
        ]
    );
}

#[test]
fn a_failing_case_reports_why_and_the_run_continues() {
    let Some(events) = run(
        vec![named("bad", "exit 3"), case("good")],
        &AtomicBool::new(false),
    ) else {
        return;
    };
    let RunEvent::CaseFinished { ok, message, .. } = &events[2] else {
        panic!("{events:?}");
    };
    assert!(!ok);
    assert!(
        message
            .as_deref()
            .is_some_and(|m| m.contains("exited with code 3")),
        "{message:?}"
    );
    assert_eq!(
        events[4],
        RunEvent::CaseFinished {
            index: 1,
            ok: true,
            message: None
        }
    );
}

#[test]
fn disabled_cases_are_not_counted() {
    let off = Case {
        enabled: false,
        ..case("off")
    };
    let Some(events) = run(vec![off, case("on")], &AtomicBool::new(false)) else {
        return;
    };
    assert_eq!(
        events[0],
        RunEvent::Started {
            suite_id: String::new(),
            total: 1
        }
    );
    assert_eq!(
        events[1],
        RunEvent::CaseStarted {
            index: 0,
            total: 1,
            name: "on".into()
        }
    );
}

#[test]
fn cancelling_before_a_case_starts_emits_nothing_more() {
    let cancel = AtomicBool::new(true);
    let Some(events) = run(vec![case("a")], &cancel) else {
        return;
    };
    assert_eq!(
        events,
        [RunEvent::Started {
            suite_id: String::new(),
            total: 1
        }]
    );
}

#[test]
fn the_serialised_event_has_a_type_tag_and_camel_case_fields() {
    let json = serde_json::to_value(RunEvent::CaseStarted {
        index: 1,
        total: 4,
        name: "x".into(),
    })
    .unwrap();
    assert_eq!(
        json,
        serde_json::json!({ "type": "caseStarted", "index": 1, "total": 4, "name": "x" })
    );
    let json = serde_json::to_value(RunEvent::Finished {
        run_id: Some("r".into()),
        status: "completed".into(),
    })
    .unwrap();
    assert_eq!(
        json,
        serde_json::json!({ "type": "finished", "runId": "r", "status": "completed" })
    );
}
