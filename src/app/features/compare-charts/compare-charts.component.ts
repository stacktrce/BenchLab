import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { RouterLink } from "@angular/router";
import { errorMessage } from "../../core/errors";
import { Latest } from "../../core/latest";
import { RunDetail } from "../../core/models";
import { parseHyperfineJSON } from "../../core/parser/hyperfine.parser";
import { SuiteApiService } from "../../core/suite-api.service";
import { CaseSet, TimingChartsComponent } from "../../shared/timing-charts/timing-charts.component";

/** Baseline and candidate of a comparison on the same axes. */
@Component({
  selector: "app-compare-charts",
  imports: [RouterLink, TimingChartsComponent],
  templateUrl: "./compare-charts.component.html",
  styleUrl: "./compare-charts.component.scss",
})
export class CompareChartsComponent {
  /** Query params, as on the compare page. */
  readonly candidate = input<string>();
  readonly baseline = input<string>();

  private readonly api = inject(SuiteApiService);
  private readonly latestLoad = new Latest();

  protected readonly candidateRun = signal<RunDetail | null>(null);
  protected readonly sets = signal<CaseSet[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly compareParams = computed(() => ({ candidate: this.candidate(), baseline: this.baseline() }));

  constructor() {
    effect(() => {
      const candidate = this.candidate();
      const baseline = this.baseline();
      untracked(() => this.load(candidate, baseline));
    });
  }

  private async load(candidateId?: string, baselineId?: string): Promise<void> {
    const isCurrent = this.latestLoad.begin();
    this.candidateRun.set(null);
    this.sets.set([]);
    this.error.set(null);
    if (!candidateId || !baselineId) {
      this.error.set("Open a comparison and choose Charts to see its runs side by side.");
      return;
    }
    try {
      const [baseline, candidate] = await Promise.all([this.api.getRun(baselineId), this.api.getRun(candidateId)]);
      if (!isCurrent()) return;
      this.candidateRun.set(candidate);
      if (!baseline.rawOutput || !candidate.rawOutput) {
        this.error.set("Both runs need results to be charted.");
        return;
      }
      this.sets.set([
        { label: "Baseline", cases: parseHyperfineJSON(baseline.rawOutput).cases, tone: "base" },
        { label: "Candidate", cases: parseHyperfineJSON(candidate.rawOutput).cases, tone: "cand" },
      ]);
    } catch (e) {
      if (isCurrent()) this.error.set(errorMessage(e));
    }
  }
}
