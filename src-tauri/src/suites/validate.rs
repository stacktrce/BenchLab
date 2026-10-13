use super::model::Suite;
use std::collections::HashSet;

/// Returns every validation problem; empty means valid.
pub(super) fn validate(suite: &Suite) -> Vec<String> {
    let mut problems = Vec::new();
    if suite.name.trim().is_empty() {
        problems.push("Suite name is required.".to_string());
    }
    if suite.runs < 1 {
        problems.push("Runs must be at least 1.".to_string());
    }
    if suite.warmup < 0 {
        problems.push("Warm-up runs cannot be negative.".to_string());
    }
    if suite.cases.is_empty() {
        problems.push("Add at least one case.".to_string());
    }
    let mut seen = HashSet::new();
    for (i, case) in suite.cases.iter().enumerate() {
        let label = if case.name.trim().is_empty() {
            format!("Case {}", i + 1)
        } else {
            format!("Case \"{}\"", case.name.trim())
        };
        if case.name.trim().is_empty() {
            problems.push(format!("{label}: name is required."));
        } else if !seen.insert(case.name.trim().to_string()) {
            problems.push(format!("{label}: name is used more than once."));
        }
        if case.command.trim().is_empty() {
            problems.push(format!("{label}: command is required."));
        }
        if let Some(budget) = case.budget_percent
            && (!budget.is_finite() || budget <= 0.0)
        {
            problems.push(format!("{label}: budget must be a number above 0."));
        }
    }
    problems
}
