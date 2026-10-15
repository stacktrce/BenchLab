import { Component, inject, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ACCENTS, TEXT_SIZES } from "../../core/appearance";
import { errorMessage } from "../../core/errors";
import { SettingsService } from "../../core/settings.service";
import { Theme } from "../../core/theme";
import { ThemeService } from "../../core/theme.service";
import { ToastService } from "../../core/toast.service";

interface AppPaths {
  database: string;
  log: string;
}

/** Appearance, defaults for new suites, and where BenchLab keeps its files. */
@Component({
  selector: "app-settings",
  templateUrl: "./settings.component.html",
  styleUrl: "./settings.component.scss",
})
export class SettingsComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly settings = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly themes: { id: Theme; name: string }[] = [
    { id: "system", name: "Follow the system" },
    { id: "light", name: "Paper (light)" },
    { id: "dark", name: "Graphite (dark)" },
  ];
  protected readonly accents = ACCENTS;
  protected readonly textSizes = TEXT_SIZES;
  protected readonly paths = signal<AppPaths | null>(null);

  constructor() {
    invoke<AppPaths>("app_paths").then(
      (p) => this.paths.set(p),
      () => this.paths.set(null),
    );
  }

  protected swatch(accentId: string): string {
    const accent = ACCENTS.find((a) => a.id === accentId);
    return accent ? accent[this.theme.effective()].fill : "";
  }

  protected setCount(key: "defaultRuns" | "defaultWarmup", value: string): void {
    this.settings.update({ [key]: Number(value) });
  }

  protected async reveal(path: string): Promise<void> {
    try {
      await revealItemInDir(path);
    } catch (e) {
      this.toast.show(`Could not open the folder: ${errorMessage(e)}`, "error");
    }
  }
}
