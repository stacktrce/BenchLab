//! Stopping hyperfine together with everything it started. Killing only hyperfine would leave the
//! benchmarked command (a grandchild, behind the shell) running.

use std::process::{Child, Command};

/// Created right after spawning, so the child cannot have started anything yet.
pub struct ProcessTree {
    #[cfg(windows)]
    job: Option<job::Job>,
}

impl ProcessTree {
    pub fn contain(child: &Child) -> Self {
        Self {
            #[cfg(windows)]
            job: job::Job::containing(child),
        }
    }

    /// Kills the whole tree and reaps the child.
    pub fn kill(&self, child: &mut Child) {
        #[cfg(windows)]
        match &self.job {
            Some(job) => job.terminate(),
            None => taskkill(child),
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
}

/// Fallback when no job object is available. Walks the tree by parent id, which is racy:
/// hyperfine starts a new shell for every run, and one started during the walk escapes it.
#[cfg(windows)]
fn taskkill(child: &Child) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = Command::new("taskkill")
        .args(["/T", "/F", "/PID", &child.id().to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

/// A Windows job object collects every process the child starts, however quickly, and
/// terminates them all in one step. That is what makes the kill atomic where walking the tree
/// is not. Only killing is requested: processes are not killed when the handle closes, so a
/// normal run behaves as before.
#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, TerminateJobObject,
    };

    pub struct Job(HANDLE);

    impl Job {
        /// None when the job cannot be created or the child cannot join it.
        pub fn containing(child: &Child) -> Option<Self> {
            // SAFETY: CreateJobObjectW takes two optional null pointers (default security,
            // unnamed). The child's handle is valid because `child` is borrowed for this call.
            // A job we fail to use is closed here, so no handle leaks.
            unsafe {
                let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if job.is_null() {
                    return None;
                }
                if AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) == 0 {
                    CloseHandle(job);
                    return None;
                }
                Some(Self(job))
            }
        }

        pub fn terminate(&self) {
            // SAFETY: `self.0` is a job handle we own and have not closed.
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: `self.0` is a job handle we own, closed exactly once, here.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(test)]
mod tests;
