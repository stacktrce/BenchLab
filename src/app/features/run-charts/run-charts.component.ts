import { DatePipe } from "@angular/common";
import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { RouterLink } from "@angular/router";
import { errorMessage } from "../../core/errors";
import { Latest } from "../../core/latest";
import { RunDetail } from "../../core/models";
import { parseHyperfineJSON } from "../../core/parser/hyperfine.parser";
import { SuiteApiService } from "../../core/suite-api.service";
import { CaseSet, TimingChartsComponent } from "../../shared/timing-charts/timing-charts.component";

@Component({
  selector: "app-run-charts",
  imports: [DatePipe, RouterLink, TimingChartsComponent],
  templateUrl: "./run-charts.component.html",
  styleUrl: "./run-charts.component.scss",
})
export class RunChartsComponent {
  readonly id = input.required<string>();

  private readonly api = inject(SuiteApiService);
  private readonly latestLoad = new Latest();

  protected readonly run = signal<RunDetail | null>(null);
  protected readonly sets = signal<CaseSet[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly hasTimings = computed(() => this.sets().some((s) => s.cases.some((c) => c.metrics.times.length)));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    const isCurrent = this.latestLoad.begin();
    this.run.set(null);
    this.sets.set([]);
    this.error.set(null);
    try {
      const run = await this.api.getRun(id);
      if (!isCurrent()) return;
      this.run.set(run);
      if (!run.rawOutput) {
        this.error.set(`This run has no results to chart (status: ${run.record.status}).`);
        return;
      }
      this.sets.set([{ label: "This run", cases: parseHyperfineJSON(run.rawOutput).cases, tone: "plain" }]);
    } catch (e) {
      if (isCurrent()) this.error.set(errorMessage(e));
    }
  }
}
