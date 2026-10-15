import { DatePipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { ActiveRunService } from "./core/active-run.service";
import { BenchmarkRunnerService } from "./core/benchmark-runner.service";
import { errorMessage } from "./core/errors";
import { ToolInfo } from "./core/parser/hyperfine.types";
import { SuiteApiService } from "./core/suite-api.service";
import { RunProgressService } from "./core/run-progress.service";
import { SettingsService } from "./core/settings.service";
import { ThemeService } from "./core/theme.service";
import { ToastService } from "./core/toast.service";
import { IconComponent } from "./shared/icon/icon.component";

@Component({
  selector: "app-root",
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DatePipe, IconComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
})
export class AppComponent {
  protected readonly api = inject(SuiteApiService);
  protected readonly toast = inject(ToastService);
  protected readonly active = inject(ActiveRunService);
  protected readonly progress = inject(RunProgressService).view;
  /** Created here so a chosen accent and text size apply from the first screen. */
  private readonly settings = inject(SettingsService);
  protected readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly runner = inject(BenchmarkRunnerService);

  protected readonly tool = signal<ToolInfo | null>(null);
  protected readonly toolError = signal<string | null>(null);

  protected readonly themeIcon = computed(() => (this.themeService.effective() === "dark" ? "moon" : "sun"));
  protected readonly themeLabel = computed(() =>
    this.themeService.effective() === "dark" ? "Switch to the light theme" : "Switch to the dark theme",
  );

  constructor() {
    this.runner
      .findHyperfine()
      .then((t) => this.tool.set(t))
      .catch((e) => this.toolError.set(errorMessage(e)));
    this.api.refresh().catch((e) => this.toast.show(`Could not load suites: ${errorMessage(e)}`, "error"));
  }

  protected async cancelActive(): Promise<void> {
    try {
      await this.api.cancelRun();
    } catch (e) {
      this.toast.show(`Could not cancel: ${errorMessage(e)}`, "error");
    }
  }

  protected async loadDemo(): Promise<void> {
    try {
      const id = await this.api.loadDemo();
      await this.router.navigate(["/suites", id]);
    } catch (e) {
      this.toast.show(`Could not load sample data: ${errorMessage(e)}`, "error");
    }
  }
}
