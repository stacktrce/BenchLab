import { DatePipe } from "@angular/common";
import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { chooseBaseline } from "../../core/baseline";
import { applyBudgets, ComparisonRow, compareRuns, configDifferences, gitNotes, summarize } from "../../core/compare";
import { errorMessage } from "../../core/errors";
import { comparisonToCsv, comparisonToMarkdown } from "../../core/export";
import { exportFileName, FileExportService } from "../../core/file-export.service";
import { Latest } from "../../core/latest";
import { PAGE_SIZE } from "../../core/paging";
import { ms, percent, signedMs } from "../../core/format";
import { RunDetail, RunRecord } from "../../core/models";
import { parseHyperfineJSON } from "../../core/parser/hyperfine.parser";
import { BenchmarkResult } from "../../core/parser/hyperfine.types";
import { SuiteApiService } from "../../core/suite-api.service";
import { IconComponent } from "../../shared/icon.component";
import { RangeStripComponent } from "../../shared/range-strip.component";

@Component({
  selector: "app-compare",
  imports: [DatePipe, RouterLink, RangeStripComponent, IconComponent],
  templateUrl: "./compare.component.html",
  styleUrl: "./compare.component.css",
})
export class CompareComponent {
  /** Query params. `candidate` is required; `baseline` defaults to the run before it. */
  readonly candidate = input<string>();
  readonly baseline = input<string>();

  private readonly api = inject(SuiteApiService);
  private readonly router = inject(Router);
  private readonly files = inject(FileExportService);
  private readonly latestLoad = new Latest();

  readonly runs = signal<RunRecord[]>([]);
  readonly baselineRun = signal<RunDetail | null>(null);
  readonly candidateRun = signal<RunDetail | null>(null);
  readonly rows = signal<ComparisonRow[]>([]);
  readonly message = signal<string | null>(null);
  /** Why the baseline was chosen, when the user did not pick one. */
  readonly autoBaseline = signal<"pinned" | "previous" | null>(null);
  readonly loading = signal(false);

  readonly summary = computed(() => summarize(this.rows()));

  readonly hideNoise = signal(false);
  readonly limit = signal(PAGE_SIZE);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly Math = Math;
  readonly shown = computed(() =>
    this.hideNoise() ? this.rows().filter((r) => r.kind !== "matched" || r.verdict !== "inconclusive") : this.rows(),
  );
  readonly visibleRows = computed(() => this.shown().slice(0, this.limit()));
  readonly hiddenCount = computed(() => Math.max(0, this.shown().length - this.limit()));
  readonly versionMismatch = computed(() => {
    const b = this.baselineRun()?.record.toolVersion;
    const c = this.candidateRun()?.record.toolVersion;
    return !!b && !!c && b !== c;
  });
  readonly configChanges = computed(() => {
    const b = this.baselineRun();
    const c = this.candidateRun();
    return b && c && this.rows().length ? configDifferences(b.config, c.config) : [];
  });

  readonly gitNotes = computed(() => {
    const b = this.baselineRun();
    const c = this.candidateRun();
    return b && c && this.rows().length ? gitNotes(b.git, c.git) : [];
  });

  /** Shared axis per row so both strips can be compared by eye. */
  protected domain(row: ComparisonRow): number {
    return Math.max(row.baseline?.max ?? 0, row.candidate?.max ?? 0);
  }

  protected readonly ms = ms;
  protected readonly signedMs = signedMs;
  protected readonly percent = percent;

  constructor() {
    effect(() => {
      const candidate = this.candidate();
      const baseline = this.baseline();
      untracked(() => this.load(candidate, baseline));
    });
  }

  private async load(candidateId?: string, baselineId?: string): Promise<void> {
    const isCurrent = this.latestLoad.begin();
    this.baselineRun.set(null);
    this.candidateRun.set(null);
    this.rows.set([]);
    this.autoBaseline.set(null);
    this.limit.set(PAGE_SIZE);
    this.message.set(null);
    if (!candidateId) {
      this.message.set("Open a run and choose Compare to start a comparison.");
      return;
    }
    this.loading.set(true);
    try {
      const candidate = await this.api.getRun(candidateId);
      const runs = await this.api.listRuns(candidate.record.suiteId, 200);
      if (!isCurrent()) return;
      this.runs.set(runs);
      this.candidateRun.set(candidate);

      let resolvedBaseline = baselineId;
      if (!resolvedBaseline) {
        const suite = await this.api.getSuite(candidate.record.suiteId);
        if (!isCurrent()) return;
        const choice = chooseBaseline(runs, candidateId, suite.baselineRunId);
        resolvedBaseline = choice?.id;
        this.autoBaseline.set(choice?.reason ?? null);
      }
      if (!resolvedBaseline) {
        this.message.set("This suite needs at least two runs with results to compare.");
        return;
      }
      if (resolvedBaseline === candidateId) {
        this.message.set("Pick two different runs.");
        return;
      }
      const baseline = await this.api.getRun(resolvedBaseline);
      if (!isCurrent()) return;
      if (baseline.record.suiteId !== candidate.record.suiteId) {
        this.message.set("These runs belong to different suites and cannot be compared.");
        return;
      }
      this.baselineRun.set(baseline);
      const b = this.parse(baseline, "Baseline");
      const c = this.parse(candidate, "Candidate");
      if (b && c) this.rows.set(applyBudgets(compareRuns(b, c), candidate.config));
    } catch (e) {
      if (isCurrent()) this.message.set(errorMessage(e));
    } finally {
      if (isCurrent()) this.loading.set(false);
    }
  }

  private parse(run: RunDetail, label: string): BenchmarkResult | null {
    if (!run.rawOutput) {
      this.message.set(`${label} run has no results (status: ${run.record.status}).`);
      return null;
    }
    try {
      return parseHyperfineJSON(run.rawOutput);
    } catch (e) {
      this.message.set(`${label} output could not be parsed: ${errorMessage(e)}`);
      return null;
    }
  }

  pick(which: "baseline" | "candidate", value: string): void {
    this.router.navigate([], {
      queryParams: {
        candidate: this.candidateRun()?.record.id,
        baseline: this.baselineRun()?.record.id,
        [which]: value,
      },
      replaceUrl: true,
    });
  }

  swap(): void {
    this.router.navigate([], {
      queryParams: {
        candidate: this.baselineRun()?.record.id,
        baseline: this.candidateRun()?.record.id,
      },
      replaceUrl: true,
    });
  }

  private markdown(): string | null {
    const b = this.baselineRun();
    const c = this.candidateRun();
    return b && c && this.rows().length ? comparisonToMarkdown(this.rows(), b.record, c.record, this.configChanges(), this.gitNotes()) : null;
  }

  saveMarkdown(): void {
    const md = this.markdown();
    const c = this.candidateRun();
    if (md && c) this.files.save(exportFileName(`${c.record.suiteName} comparison`, "md"), md, "md");
  }

  copyMarkdown(): void {
    const md = this.markdown();
    if (md) this.files.copy(md);
  }

  saveCsv(): void {
    const c = this.candidateRun();
    if (c && this.rows().length) {
      this.files.save(exportFileName(`${c.record.suiteName} comparison`, "csv"), comparisonToCsv(this.rows()), "csv");
    }
  }

  /** Cases whose evidence is weak, for the aggregated note under the table. */
  protected readonly flagged = computed(() => this.rows().filter((r) => r.kind === "matched" && r.caveats.length));
}
