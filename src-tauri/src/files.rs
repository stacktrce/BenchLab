use serde::Deserialize;
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
    if !matches!(ext.as_deref(), Some("md" | "csv" | "txt")) {
        return Err("Only .md, .csv and .txt exports are allowed.".into());
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

/// A spreadsheet built by the frontend. Each sheet has a header row; values are JSON strings,
/// numbers or null (an empty cell).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workbook {
    pub sheets: Vec<Sheet>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sheet {
    pub name: String,
    pub columns: Vec<Column>,
    pub rows: Vec<Vec<serde_json::Value>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Column {
    pub title: String,
    /// Decimal places shown for numbers; None for a text column.
    pub decimals: Option<u8>,
}

fn xlsx_err(e: rust_xlsxwriter::XlsxError) -> String {
    format!("Could not build the spreadsheet: {e}")
}

/// Writes an Excel workbook chosen through the native save dialog. Numbers are stored as
/// numbers, so Excel shows them correctly whatever the locale's decimal mark, which a CSV
/// cannot guarantee. Text is always written as text, never as a formula.
#[tauri::command]
pub fn write_xlsx_file(path: String, workbook: Workbook) -> Result<(), String> {
    use rust_xlsxwriter::{Format, FormatBorder};
    let p = Path::new(&path);
    if !p.is_absolute() {
        return Err("Export path must be absolute.".into());
    }
    let is_xlsx = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("xlsx"));
    if !is_xlsx {
        return Err("Only .xlsx spreadsheets can be saved.".into());
    }
    let header = Format::new()
        .set_bold()
        .set_border_bottom(FormatBorder::Thin);
    let mut book = rust_xlsxwriter::Workbook::new();
    for sheet in &workbook.sheets {
        let ws = book.add_worksheet();
        ws.set_name(&sheet.name).map_err(xlsx_err)?;
        let formats: Vec<Option<Format>> = sheet
            .columns
            .iter()
            .map(|c| {
                c.decimals.map(|d| {
                    let places = "0".repeat(usize::from(d));
                    let pattern = if d == 0 {
                        "0".to_string()
                    } else {
                        format!("0.{places}")
                    };
                    Format::new().set_num_format(pattern)
                })
            })
            .collect();
        for (col, column) in sheet.columns.iter().enumerate() {
            let col = col as u16;
            ws.write_string_with_format(0, col, &column.title, &header)
                .map_err(xlsx_err)?;
        }
        for (r, row) in sheet.rows.iter().enumerate() {
            let r = (r + 1) as u32;
            for (col, value) in row.iter().enumerate() {
                let c = col as u16;
                match value {
                    serde_json::Value::Null => {}
                    serde_json::Value::Number(n) => {
                        let n = n.as_f64().unwrap_or(f64::NAN);
                        match formats.get(col).and_then(Option::as_ref) {
                            Some(f) => ws.write_number_with_format(r, c, n, f),
                            None => ws.write_number(r, c, n),
                        }
                        .map_err(xlsx_err)?;
                    }
                    serde_json::Value::String(text) => {
                        ws.write_string(r, c, text).map_err(xlsx_err)?;
                    }
                    other => {
                        ws.write_string(r, c, other.to_string()).map_err(xlsx_err)?;
                    }
                }
            }
        }
        ws.set_freeze_panes(1, 0).map_err(xlsx_err)?;
        ws.autofit();
    }
    book.save(p)
        .map_err(|e| format!("Could not write {path}: {e}"))
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

    fn read_part(path: &std::path::Path, part: &str) -> String {
        use std::io::Read;
        let mut archive = zip::ZipArchive::new(std::fs::File::open(path).unwrap()).unwrap();
        let mut text = String::new();
        archive
            .by_name(part)
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        text
    }

    fn sample_workbook() -> Workbook {
        Workbook {
            sheets: vec![
                Sheet {
                    name: "Results".into(),
                    columns: vec![
                        Column {
                            title: "Case".into(),
                            decimals: None,
                        },
                        Column {
                            title: "Mean (ms)".into(),
                            decimals: Some(3),
                        },
                    ],
                    rows: vec![
                        vec![serde_json::json!("=1+1"), serde_json::json!(42.0312)],
                        vec![serde_json::json!("no timing"), serde_json::Value::Null],
                    ],
                },
                Sheet {
                    name: "Notes".into(),
                    columns: vec![Column {
                        title: "Note".into(),
                        decimals: None,
                    }],
                    rows: vec![vec![serde_json::json!(
                        "Within noise means the 95% interval spans zero."
                    )]],
                },
            ],
        }
    }

    #[test]
    fn writes_numbers_as_numbers_and_text_never_as_formulas() {
        let p = std::env::temp_dir().join(format!("benchlab-test-{}.xlsx", std::process::id()));
        write_xlsx_file(p.to_string_lossy().into(), sample_workbook()).unwrap();
        let sheet = read_part(&p, "xl/worksheets/sheet1.xml");
        let strings = read_part(&p, "xl/sharedStrings.xml");
        let workbook = read_part(&p, "xl/workbook.xml");
        let _ = std::fs::remove_file(&p);
        assert!(sheet.contains("<v>42.0312</v>"), "{sheet}");
        assert!(
            !sheet.contains("<f>"),
            "a text cell became a formula: {sheet}"
        );
        assert!(strings.contains("=1+1"), "{strings}");
        assert!(
            workbook.contains("name=\"Results\"") && workbook.contains("name=\"Notes\""),
            "{workbook}"
        );
    }

    #[test]
    fn xlsx_needs_an_absolute_xlsx_path() {
        assert!(write_xlsx_file("out.xlsx".into(), sample_workbook()).is_err());
        let csv = std::env::temp_dir().join("benchlab-test-wrong.csv");
        assert!(write_xlsx_file(csv.to_string_lossy().into(), sample_workbook()).is_err());
        assert!(!csv.exists());
    }

    #[test]
    fn an_invalid_sheet_name_is_an_error_not_a_panic() {
        let mut book = sample_workbook();
        book.sheets[0].name = "a/b".into();
        let p = std::env::temp_dir().join(format!("benchlab-test-bad-{}.xlsx", std::process::id()));
        assert!(write_xlsx_file(p.to_string_lossy().into(), book).is_err());
    }
}
