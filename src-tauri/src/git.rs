//! Records which commit a benchmark ran against, so a result can be tied to a code state.
//!
//! Only `git` plumbing and `status` are used, with the fsmonitor hook disabled: a repository's own
//! config can name a program for fsmonitor, and reading a repo's state must not execute it.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    /// The directory a case ran in, as configured.
    pub dir: String,
    /// Top level of the repository containing `dir`.
    pub root: String,
    pub commit: String,
    pub short_commit: String,
    /// None on a detached HEAD.
    pub branch: Option<String>,
    /// Uncommitted or untracked changes were present when the run started.
    pub dirty: bool,
    pub changed_files: usize,
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.args(["-c", "core.fsmonitor=false", "--no-optional-locks", "-C"])
        .arg(dir)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim_end().to_string())
}

/// None when `dir` is not inside a repository with at least one commit, or git is unavailable.
pub fn capture(dir: &str) -> Option<GitInfo> {
    let path = Path::new(dir);
    if !path.is_dir() {
        return None;
    }
    let root = git(path, &["rev-parse", "--show-toplevel"])?;
    let commit = git(path, &["rev-parse", "HEAD"])?;
    let branch = git(path, &["symbolic-ref", "--short", "-q", "HEAD"]).filter(|b| !b.is_empty());
    let status = git(path, &["status", "--porcelain", "--untracked-files=normal"])?;
    let changed_files = status.lines().filter(|l| !l.trim().is_empty()).count();
    Some(GitInfo {
        dir: dir.to_string(),
        root,
        short_commit: commit.chars().take(7).collect(),
        commit,
        branch,
        dirty: changed_files > 0,
        changed_files,
    })
}

/// One entry per repository, in the order the directories were first seen.
pub fn capture_all<'a>(dirs: impl IntoIterator<Item = &'a str>) -> Vec<GitInfo> {
    let mut seen = HashSet::new();
    dirs.into_iter()
        .filter_map(capture)
        .filter(|info| seen.insert(info.root.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn git_available() -> bool {
        Command::new("git").arg("--version").output().is_ok()
    }

    fn run(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
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
            .unwrap();
        assert!(
            status.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&status.stderr)
        );
    }

    fn repo(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("benchlab-git-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        run(&dir, &["init", "-q", "-b", "main"]);
        dir
    }

    fn commit_file(dir: &Path, name: &str, content: &str) {
        std::fs::write(dir.join(name), content).unwrap();
        run(dir, &["add", name]);
        run(dir, &["commit", "-q", "-m", "c"]);
    }

    #[test]
    fn clean_repo_reports_commit_and_branch() {
        if !git_available() {
            return;
        }
        let dir = repo("clean");
        commit_file(&dir, "a.txt", "1");
        let info = capture(dir.to_str().unwrap()).unwrap();
        assert_eq!(info.commit.len(), 40);
        assert_eq!(info.short_commit, &info.commit[..7]);
        assert_eq!(info.branch.as_deref(), Some("main"));
        assert!(!info.dirty && info.changed_files == 0);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn modified_and_untracked_files_make_it_dirty() {
        if !git_available() {
            return;
        }
        let dir = repo("dirty");
        commit_file(&dir, "a.txt", "1");
        std::fs::write(dir.join("a.txt"), "2").unwrap();
        std::fs::write(dir.join("new.txt"), "x").unwrap();
        let info = capture(dir.to_str().unwrap()).unwrap();
        assert!(info.dirty);
        assert_eq!(info.changed_files, 2);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_subdirectory_resolves_to_the_repository_root() {
        if !git_available() {
            return;
        }
        let dir = repo("sub");
        commit_file(&dir, "a.txt", "1");
        std::fs::create_dir(dir.join("pkg")).unwrap();
        let info = capture(dir.join("pkg").to_str().unwrap()).unwrap();
        assert!(Path::new(&info.root).ends_with(dir.file_name().unwrap()));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn detached_head_has_no_branch() {
        if !git_available() {
            return;
        }
        let dir = repo("detached");
        commit_file(&dir, "a.txt", "1");
        run(&dir, &["checkout", "-q", "--detach"]);
        assert_eq!(capture(dir.to_str().unwrap()).unwrap().branch, None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn not_a_repo_empty_repo_and_missing_dir_give_none() {
        if !git_available() {
            return;
        }
        let plain = std::env::temp_dir().join(format!("benchlab-git-{}-plain", std::process::id()));
        std::fs::create_dir_all(&plain).unwrap();
        // The temp dir could itself sit inside a repository; only assert when it does not.
        if git(&plain, &["rev-parse", "--show-toplevel"]).is_none() {
            assert!(capture(plain.to_str().unwrap()).is_none());
        }
        let empty = repo("empty");
        assert!(capture(empty.to_str().unwrap()).is_none(), "no commit yet");
        assert!(capture("Z:\\definitely\\not\\here").is_none());
        let _ = std::fs::remove_dir_all(plain);
        let _ = std::fs::remove_dir_all(empty);
    }

    #[test]
    fn capture_all_lists_each_repository_once() {
        if !git_available() {
            return;
        }
        let dir = repo("all");
        commit_file(&dir, "a.txt", "1");
        std::fs::create_dir(dir.join("pkg")).unwrap();
        let root = dir.to_str().unwrap().to_string();
        let sub = dir.join("pkg").to_str().unwrap().to_string();
        let infos = capture_all([root.as_str(), sub.as_str(), "Z:\\nope"]);
        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].dir, root);
        let _ = std::fs::remove_dir_all(dir);
    }
}
