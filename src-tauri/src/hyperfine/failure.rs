fn first_line(s: &str) -> &str {
    s.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
}

/// Why a case failed, from hyperfine's stderr. hyperfine's own advice names command-line flags
/// (`--ignore-failure`, `--show-output`) that the app does not offer, so the known messages are
/// reworded and unknown ones keep only their first line.
pub fn explain_failure(stderr: &str, exit_code: Option<i32>) -> String {
    const COMMAND_FAILED: &str = "Command terminated with non-zero exit code ";
    for line in stderr.lines().map(str::trim) {
        if let Some(rest) = line.split(COMMAND_FAILED).nth(1) {
            let what = rest
                .split(". ")
                .next()
                .unwrap_or(rest)
                .trim_end_matches('.');
            return format!(
                "The command exited with code {what}. Check that it runs in a terminal from the case's working directory."
            );
        }
        for hook in ["setup", "cleanup"] {
            if line.contains(&format!(
                "The {hook} command terminated with a non-zero exit code"
            )) {
                return format!("The {hook} command exited with a non-zero code.");
            }
        }
    }
    let detail = first_line(stderr);
    let detail = detail.strip_prefix("Error: ").unwrap_or(detail);
    match (detail.is_empty(), exit_code) {
        (true, _) => "Hyperfine stopped without an error message.".to_string(),
        (false, Some(code)) => format!("Hyperfine stopped: {detail} (exit code {code})"),
        (false, None) => format!("Hyperfine stopped: {detail}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Messages captured from hyperfine 1.20.0 on Windows.
    const COMMAND_FAILED: &str = "Error: Command terminated with non-zero exit code 1 in the first benchmark run. Use the '-i'/'--ignore-failure' option if you want to ignore this. Alternatively, use the '--show-output' option to debug what went wrong.";
    const SETUP_FAILED: &str = "Error: The setup command terminated with a non-zero exit code. Append ' || true' to the command if you are sure that this can be ignored.";

    #[test]
    fn a_failing_command_is_explained_without_hyperfine_flags() {
        let text = explain_failure(&format!("\n{COMMAND_FAILED}\n"), Some(1));
        assert_eq!(
            text,
            "The command exited with code 1 in the first benchmark run. Check that it runs in a terminal from the case's working directory."
        );
        assert!(!text.contains("--"), "{text}");
    }

    #[test]
    fn a_failing_setup_command_is_named() {
        let text = explain_failure(SETUP_FAILED, Some(1));
        assert_eq!(text, "The setup command exited with a non-zero code.");
    }

    #[test]
    fn an_unknown_error_keeps_hyperfines_first_line() {
        assert_eq!(
            explain_failure("Error: Something new happened.\nmore", Some(2)),
            "Hyperfine stopped: Something new happened. (exit code 2)"
        );
        assert_eq!(
            explain_failure("", None),
            "Hyperfine stopped without an error message."
        );
    }
}
