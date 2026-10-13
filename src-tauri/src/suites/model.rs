use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: i64 = 1;

fn default_true() -> bool {
    true
}

fn default_runs() -> i64 {
    10
}

fn default_warmup() -> i64 {
    1
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    /// Empty for a case that has not been saved yet.
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub setup_command: Option<String>,
    #[serde(default)]
    pub cleanup_command: Option<String>,
    #[serde(default)]
    pub working_directory: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Flag this case when it is slower than the baseline by more than this many percent.
    /// Only a confident breach counts (see the comparison view); None means no budget.
    #[serde(default)]
    pub budget_percent: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Suite {
    /// Empty for a suite that has not been saved yet.
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_runs")]
    pub runs: i64,
    /// Untimed runs before measuring, to fill caches.
    #[serde(default = "default_warmup")]
    pub warmup: i64,
    /// The run comparisons use by default. Changed only through `set_baseline`: saving a suite
    /// neither sets nor clears it, so editing the form cannot unpin by accident.
    #[serde(default)]
    pub baseline_run_id: Option<String>,
    #[serde(default)]
    pub schema_version: i64,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    pub cases: Vec<Case>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SuiteSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub case_count: i64,
    pub updated_at: String,
}
