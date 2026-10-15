use std::path::Path;

const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

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
    if !matches!(ext.as_deref(), Some("md" | "csv" | "txt" | "svg")) {
        return Err("Only .md, .csv, .svg and .txt exports are allowed.".into());
    }
    std::fs::write(p, content).map_err(|e| format!("Could not write {path}: {e}"))
}

/// Writes a chart image chosen through the native save dialog. Only PNG, and only bytes that
/// start like a PNG, so this cannot be used to write other binaries.
#[tauri::command]
pub fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_absolute() {
        return Err("Export path must be absolute.".into());
    }
    let is_png_name = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("png"));
    if !is_png_name {
        return Err("Only .png images can be saved.".into());
    }
    if !bytes.starts_with(&PNG_SIGNATURE) {
        return Err("The image is not a valid PNG.".into());
    }
    std::fs::write(p, bytes).map_err(|e| format!("Could not write {path}: {e}"))
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
    fn allows_svg_charts_as_text() {
        let p = std::env::temp_dir().join(format!("benchlab-test-{}.svg", std::process::id()));
        write_text_file(p.to_string_lossy().into(), "<svg/>".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "<svg/>");
        let _ = std::fs::remove_file(p);
    }

    fn png_bytes() -> Vec<u8> {
        let mut bytes = PNG_SIGNATURE.to_vec();
        bytes.extend_from_slice(b"rest of the image");
        bytes
    }

    #[test]
    fn writes_png_images() {
        let p = std::env::temp_dir().join(format!("benchlab-test-{}.png", std::process::id()));
        write_binary_file(p.to_string_lossy().into(), png_bytes()).unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), png_bytes());
        let _ = std::fs::remove_file(p);
    }

    #[test]
    fn rejects_binary_files_that_are_not_pngs() {
        let dir = std::env::temp_dir();
        let png = dir.join("benchlab-test-rejected.png");
        assert!(write_binary_file("out.png".into(), png_bytes()).is_err());
        assert!(
            write_binary_file(png.to_string_lossy().into(), b"MZ not an image".to_vec()).is_err()
        );
        assert!(!png.exists());
        let exe = dir.join("benchlab-test-rejected.exe");
        assert!(write_binary_file(exe.to_string_lossy().into(), png_bytes()).is_err());
        assert!(!exe.exists());
    }

    #[test]
    fn writes_allowed_exports() {
        let p = std::env::temp_dir().join(format!("benchlab-test-{}.csv", std::process::id()));
        write_text_file(p.to_string_lossy().into(), "a,b\n".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "a,b\n");
        let _ = std::fs::remove_file(p);
    }
}
