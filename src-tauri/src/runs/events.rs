//! Progress of a suite run, reported while it happens. The runner only knows a `RunSink`, so it
//! can be tested with a list instead of a window.

use serde::Serialize;

/// Only one benchmark runs at a time, so events carry no run id until the run is stored.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RunEvent {
    Started {
        suite_id: String,
        total: usize,
    },
    CaseStarted {
        index: usize,
        total: usize,
        name: String,
    },
    /// `message` says why a case failed; None when it succeeded.
    CaseFinished {
        index: usize,
        ok: bool,
        message: Option<String>,
    },
    /// The stored run, or None when it could not be stored.
    Finished {
        run_id: Option<String>,
        status: String,
    },
}

pub trait RunSink: Send + Sync {
    fn emit(&self, event: RunEvent);
}

/// Sends events to the window as `run-progress`.
pub struct TauriSink(pub tauri::AppHandle);

pub const PROGRESS_EVENT: &str = "run-progress";

impl RunSink for TauriSink {
    fn emit(&self, event: RunEvent) {
        use tauri::Emitter;
        // Progress is a convenience; a window that is gone must not stop the benchmark.
        let _ = self.0.emit(PROGRESS_EVENT, event);
    }
}

#[cfg(test)]
#[derive(Default)]
pub struct VecSink(std::sync::Mutex<Vec<RunEvent>>);

#[cfg(test)]
impl VecSink {
    pub fn events(&self) -> Vec<RunEvent> {
        self.0.lock().map(|e| e.clone()).unwrap_or_default()
    }
}

#[cfg(test)]
impl RunSink for VecSink {
    fn emit(&self, event: RunEvent) {
        if let Ok(mut events) = self.0.lock() {
            events.push(event);
        }
    }
}

#[cfg(test)]
mod tests;
