use std::path::Path;

/// Writes an export chosen through the native save dialog. Limited to text export
/// formats so this command cannot be used to drop executables or configs.
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_absolute() {
        return Err("Export path must be absolute.".into());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    if !matches!(ext.as_deref(), Some("md" | "csv" | "txt")) {
        return Err("Only .md, .csv and .txt exports are allowed.".into());
    }
    std::fs::write(p, content).map_err(|e| format!("Could not write {path}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_paths_and_other_extensions() {
        assert!(write_text_file("out.md".into(), String::new()).is_err());
        let exe = std::env::temp_dir().join("benchlab-test.exe");
        assert!(write_text_file(exe.to_string_lossy().into(), String::new()).is_err());
    }

    #[test]
    fn writes_allowed_exports() {
        let p = std::env::temp_dir().join(format!("benchlab-test-{}.csv", std::process::id()));
        write_text_file(p.to_string_lossy().into(), "a,b\n".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "a,b\n");
        let _ = std::fs::remove_file(p);
    }
}
