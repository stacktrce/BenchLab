import { Component, computed, inject, input, signal } from "@angular/core";
import { ActiveRunService } from "../../../core/active-run.service";
import { errorMessage } from "../../../core/errors";
import { stripAnsi } from "../../../core/log-text";
import { DiagnoseResult, Suite } from "../../../core/models";
import { SuiteApiService } from "../../../core/suite-api.service";
import { ConfirmItem, RunConfirmComponent } from "../../../shared/run-confirm/run-confirm.component";

/**
 * "Run once and show output" for a failed case. hyperfine discards a command's output while
 * timing it, so this runs the case's current commands once more, after the usual confirmation.
 */
@Component({
  selector: "app-diagnose-case",
  imports: [RunConfirmComponent],
  templateUrl: "./diagnose-case.component.html",
  styleUrl: "./diagnose-case.component.scss",
})
export class DiagnoseCaseComponent {
  /** The suite as saved now: it may differ from the run, which is why the dialog shows it. */
  readonly suite = input.required<Suite>();
  readonly caseName = input.required<string>();

  private readonly api = inject(SuiteApiService);
  private readonly activeRun = inject(ActiveRunService);

  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly result = signal<DiagnoseResult | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly case = computed(() => this.suite().cases.find((c) => c.name === this.caseName()) ?? null);
  protected readonly items = computed<ConfirmItem[]>(() => {
    const c = this.case();
    return c ? [{ name: c.name, command: c.command, setupCommand: c.setupCommand, cleanupCommand: c.cleanupCommand, workingDirectory: c.workingDirectory }] : [];
  });
  protected readonly output = computed(() => stripAnsi(this.result()?.output ?? ""));

  protected async run(): Promise<void> {
    this.confirming.set(false);
    this.busy.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const result = await this.activeRun.track({ label: `${this.caseName()} once`, suiteId: this.suite().id }, () =>
        this.api.diagnoseCase(this.suite().id, this.caseName()),
      );
      this.result.set(result);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
