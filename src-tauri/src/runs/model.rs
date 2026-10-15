use crate::git::GitInfo;
use crate::logs::LogChunk;
use crate::suites::Suite;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
    pub id: String,
    pub suite_id: String,
    pub suite_name: String,
    pub started_at: String,
    pub finished_at: String,
    pub status: String,
    pub tool_version: String,
    pub case_count: i64,
    pub error: Option<String>,
    pub note: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunDetail {
    pub record: RunRecord,
    /// Suite configuration at run time; absent for runs recorded before snapshots existed.
    pub config: Option<Suite>,
    /// Repositories the cases ran in, as they were when the run started. Empty when no case has a
    /// working directory inside a git repository, and for runs recorded before this was captured.
    pub git: Vec<GitInfo>,
    /// Merged hyperfine JSON for the cases that completed.
    pub raw_output: Option<String>,
}

pub struct SuiteOutcome {
    pub results: Vec<serde_json::Value>,
    pub errors: Vec<String>,
    pub case_count: i64,
    pub git: Vec<GitInfo>,
    pub logs: Vec<LogChunk>,
}

pub(super) const CANCELLED_MESSAGE: &str = "Cancelled by user. Remaining cases were not run.";

impl SuiteOutcome {
    pub fn status(&self) -> &'static str {
        match (self.results.is_empty(), self.errors.is_empty()) {
            (_, true) => "completed",
            (true, false) => "failed",
            (false, false) => "partial",
        }
    }

    pub fn raw_output(&self) -> Option<String> {
        (!self.results.is_empty())
            .then(|| serde_json::json!({ "results": self.results }).to_string())
    }
}

#[cfg(test)]
mod tests {
    use crate::testing::outcome;

    #[test]
    fn status_reflects_mix_of_results_and_errors() {
        assert_eq!(outcome(2, 0).status(), "completed");
        assert_eq!(outcome(1, 1).status(), "partial");
        assert_eq!(outcome(0, 2).status(), "failed");
        assert!(outcome(0, 1).raw_output().is_none());
    }
}
