import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { ActiveRunService } from "../../core/active-run.service";
import { BenchmarkRunnerService, RunOutcome } from "../../core/benchmark-runner.service";
import { errorMessage } from "../../core/errors";
import { SuiteApiService } from "../../core/suite-api.service";
import { ToastService } from "../../core/toast.service";
import { IconComponent } from "../../shared/icon/icon.component";
import { ResultsTableComponent } from "../../shared/results-table/results-table.component";
import { RunConfirmComponent } from "../../shared/run-confirm/run-confirm.component";

type Phase = "editing" | "confirming" | "running";

/** Unsaved one-off run of a single command. */
@Component({
  selector: "app-quick-run",
  imports: [FormsModule, ResultsTableComponent, RunConfirmComponent, IconComponent],
  templateUrl: "./quick-run.component.html",
  styleUrl: "./quick-run.component.scss",
})
export class QuickRunComponent {
  private readonly runner = inject(BenchmarkRunnerService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly activeRun = inject(ActiveRunService);
  protected readonly api = inject(SuiteApiService);

  command = "";
  workingDir = "";
  runs = 10;

  readonly phase = signal<Phase>("editing");
  readonly outcome = signal<RunOutcome | null>(null);
  readonly hyperfineError = signal<string | null>(null);
  readonly hyperfineFound = signal(false);

  constructor() {
    this.checkHyperfine();
  }

  checkHyperfine(): void {
    this.hyperfineError.set(null);
    this.runner
      .findHyperfine()
      .then(() => this.hyperfineFound.set(true))
      .catch((e) => this.hyperfineError.set(errorMessage(e)));
  }

  canReview(): boolean {
    return (
      this.command.trim().length > 0 &&
      this.hyperfineFound() &&
      this.phase() === "editing" &&
      !this.activeRun.current()
    );
  }

  review(): void {
    if (this.canReview()) this.phase.set("confirming");
  }

  cancel(): void {
    this.phase.set("editing");
  }

  async confirm(): Promise<void> {
    this.phase.set("running");
    this.outcome.set(null);
    const outcome = await this.runner.run({
      command: this.command,
      workingDir: this.workingDir.trim() || undefined,
      runs: this.runs,
    });
    this.outcome.set(outcome);
    this.phase.set("editing");
  }

  async cancelRun(): Promise<void> {
    try {
      await this.runner.cancel();
    } catch (e) {
      this.toast.show(`Could not cancel: ${errorMessage(e)}`, "error");
    }
  }

  async loadDemo(): Promise<void> {
    try {
      const id = await this.api.loadDemo();
      await this.router.navigate(["/suites", id]);
    } catch (e) {
      this.toast.show(`Could not load sample data: ${errorMessage(e)}`, "error");
    }
  }
}
