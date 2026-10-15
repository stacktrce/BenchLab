use super::control::RunControl;
use super::locate::{Source, locate_hyperfine, locate_with_source, tool_version};
use super::process::{Job, RunOutput, exec};
use serde::Serialize;
use std::time::Duration;

const DEFAULT_TIMEOUT_SECS: u64 = 30;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub path: String,
    pub source: Source,
    pub version: String,
}

#[tauri::command]
pub async fn find_hyperfine() -> Result<ToolInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (path, source) = locate_with_source()?;
        let version = tool_version(&path);
        Ok(ToolInfo {
            path: path.to_string_lossy().into_owned(),
            source,
            version,
        })
    })
    .await
    .map_err(|e| format!("Lookup failed: {e}"))?
}

/// Quick, unsaved single-command run. The frontend must confirm with the user first.
#[tauri::command]
pub async fn run_benchmark(
    command: String,
    working_dir: Option<String>,
    runs: Option<u32>,
    timeout_secs: Option<u64>,
    control: tauri::State<'_, RunControl>,
) -> Result<RunOutput, String> {
    if command.trim().is_empty() {
        return Err("Command is empty".into());
    }
    let hyperfine = locate_hyperfine()?;
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));
    let active = control.begin()?;
    log::info!("Quick run: {command}");
    let cancel = active.flag();
    let output = tauri::async_runtime::spawn_blocking(move || {
        exec(
            &hyperfine,
            &Job {
                name: None,
                command: &command,
                setup: None,
                cleanup: None,
                working_dir: working_dir.as_deref(),
                runs,
                warmup: None,
                timeout,
                cancel: Some(&cancel),
            },
        )
    })
    .await
    .map_err(|e| format!("Benchmark task failed: {e}"))?;
    if let Ok(RunOutput {
        failure: Some(why), ..
    }) = &output
    {
        log::warn!("Quick run failed: {why}");
    }
    output
}

#[tauri::command]
pub fn cancel_run(control: tauri::State<'_, RunControl>) -> bool {
    control.cancel()
}
