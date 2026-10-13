use std::sync::atomic::{AtomicBool, Ordering};

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_run_at_a_time_and_cancel_reaches_it() {
        let control = RunControl::default();
        assert!(!control.cancel(), "nothing to cancel yet");
        let first = control.begin().unwrap();
        assert!(control.begin().is_err());
        assert!(control.cancel());
        assert!(first.flag().load(Ordering::SeqCst));
        drop(first);
        assert!(
            control.begin().is_ok(),
            "slot is released when the run ends"
        );
    }
}
