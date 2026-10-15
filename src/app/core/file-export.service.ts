import { inject, Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { errorMessage } from "./errors";
import { Workbook } from "./spreadsheet";
import { ToastService } from "./toast.service";

export function exportFileName(base: string, ext: "md" | "csv" | "png" | "xlsx", date = new Date()): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "benchlab";
  return `${slug}-${date.toISOString().slice(0, 10)}.${ext}`;
}

const FILTER_NAMES = { md: "Markdown", csv: "CSV", png: "PNG image", xlsx: "Excel workbook" };

@Injectable({ providedIn: "root" })
export class FileExportService {
  private readonly toast = inject(ToastService);

  async save(defaultName: string, content: string, ext: "md" | "csv"): Promise<void> {
    await this.write(defaultName, FILTER_NAMES[ext], ext, (path) => invoke("write_text_file", { path, content }));
  }

  async saveWorkbook(defaultName: string, workbook: Workbook): Promise<void> {
    await this.write(defaultName, FILTER_NAMES.xlsx, "xlsx", (path) => invoke("write_xlsx_file", { path, workbook }));
  }

  async saveImage(defaultName: string, bytes: Uint8Array): Promise<void> {
    await this.write(defaultName, FILTER_NAMES.png, "png", (path) =>
      invoke("write_binary_file", { path, bytes: Array.from(bytes) }),
    );
  }

  private async write(defaultName: string, filterName: string, ext: string, write: (path: string) => Promise<unknown>): Promise<void> {
    try {
      const path = await save({ defaultPath: defaultName, filters: [{ name: filterName, extensions: [ext] }] });
      if (!path) return;
      await write(path);
      this.toast.show(`Exported to ${path}`);
    } catch (e) {
      this.toast.show(`Export failed: ${errorMessage(e)}`, "error");
    }
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show("Copied to clipboard");
    } catch (e) {
      this.toast.show(`Copy failed: ${errorMessage(e)}`, "error");
    }
  }
}
