import { inject, Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { errorMessage } from "./errors";
import { ToastService } from "./toast.service";

export function exportFileName(base: string, ext: "md" | "csv", date = new Date()): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "benchlab";
  return `${slug}-${date.toISOString().slice(0, 10)}.${ext}`;
}

@Injectable({ providedIn: "root" })
export class FileExportService {
  private readonly toast = inject(ToastService);

  async save(defaultName: string, content: string, ext: "md" | "csv"): Promise<void> {
    try {
      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: ext === "md" ? "Markdown" : "CSV", extensions: [ext] }],
      });
      if (!path) return;
      await invoke("write_text_file", { path, content });
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
