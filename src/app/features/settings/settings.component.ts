import { Component, inject, signal } from "@angular/core";
import { AppFilesService, AppPaths } from "../../core/app-files.service";
import { ACCENTS, TEXT_SIZES } from "../../core/appearance";
import { errorMessage } from "../../core/errors";
import { MAX_COUNT, SettingsService } from "../../core/settings.service";
import { Theme } from "../../core/theme";
import { ThemeService } from "../../core/theme.service";
import { ToastService } from "../../core/toast.service";

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
  private readonly files = inject(AppFilesService);

  protected readonly themes: { id: Theme; name: string }[] = [
    { id: "system", name: "Follow the system" },
    { id: "light", name: "Paper (light)" },
    { id: "dark", name: "Graphite (dark)" },
  ];
  protected readonly accents = ACCENTS;
  protected readonly textSizes = TEXT_SIZES;
  protected readonly paths = signal<AppPaths | null>(null);

  constructor() {
    this.files.paths().then(
      (p) => this.paths.set(p),
      () => this.paths.set(null),
    );
  }

  protected swatch(accentId: string): string {
    const accent = ACCENTS.find((a) => a.id === accentId);
    return accent ? accent[this.theme.effective()].fill : "";
  }

  protected readonly countError = signal<string | null>(null);

  /** Out-of-range input is refused with a reason, and the box goes back to the saved value. */
  protected setCount(key: "defaultRuns" | "defaultWarmup", input: HTMLInputElement): void {
    const value = Number(input.value);
    const min = key === "defaultRuns" ? 1 : 0;
    if (!Number.isInteger(value) || value < min || value > MAX_COUNT) {
      const what = key === "defaultRuns" ? "Timed runs" : "Warm-up runs";
      this.countError.set(`${what} must be a whole number from ${min} to ${MAX_COUNT.toLocaleString("en")}.`);
      input.value = String(this.settings.settings()[key]);
      return;
    }
    this.countError.set(null);
    this.settings.update({ [key]: value });
  }

  protected async reveal(path: string): Promise<void> {
    try {
      await this.files.revealInFolder(path);
    } catch (e) {
      this.toast.show(`Could not open the folder: ${errorMessage(e)}`, "error");
    }
  }
}
