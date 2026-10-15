import { DatePipe } from "@angular/common";
import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { RouterLink } from "@angular/router";
import { errorMessage } from "../../core/errors";
import { exportFileName, FileExportService } from "../../core/file-export.service";
import { Latest } from "../../core/latest";
import { runToCsv, runToMarkdown } from "../../core/export";
import { describeGit } from "../../core/format";
import { RunDetail, RunLog, Suite } from "../../core/models";
import { parseHyperfineJSON } from "../../core/parser/hyperfine.parser";
import { BenchmarkResult } from "../../core/parser/hyperfine.types";
import { runToWorkbook } from "../../core/spreadsheet";
import { SuiteApiService } from "../../core/suite-api.service";
import { ToastService } from "../../core/toast.service";
import { IconComponent } from "../../shared/icon/icon.component";
import { ResultsTableComponent } from "../../shared/results-table/results-table.component";
import { DiagnoseCaseComponent } from "./diagnose-case/diagnose-case.component";
import { RunLogComponent } from "./run-log/run-log.component";

@Component({
  selector: "app-run-detail",
  imports: [DatePipe, RouterLink, ResultsTableComponent, IconComponent, RunLogComponent, DiagnoseCaseComponent],
  templateUrl: "./run-detail.component.html",
  styleUrl: "./run-detail.component.scss",
})
export class RunDetailComponent {
  readonly id = input.required<string>();

  protected readonly describeGit = describeGit;

  private readonly api = inject(SuiteApiService);
  private readonly files = inject(FileExportService);
  private readonly toast = inject(ToastService);
  private readonly latestLoad = new Latest();

  readonly detail = signal<RunDetail | null>(null);
  readonly result = signal<BenchmarkResult | null>(null);
  readonly error = signal<string | null>(null);
  protected readonly suite = signal<Suite | null>(null);
  protected readonly logs = signal<RunLog[] | null>(null);
  /** Case names from the error lines, which read `"name": why`. */
  protected readonly failedCases = computed(() =>
    [...(this.detail()?.record.error ?? "").matchAll(/^"(.*)": /gm)].map((m) => m[1]),
  );

  readonly isBaseline = computed(() => {
    const d = this.detail();
    return !!d && d.record.id === this.suite()?.baselineRunId;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    const isCurrent = this.latestLoad.begin();
    this.detail.set(null);
    this.result.set(null);
    this.error.set(null);
    this.suite.set(null);
    this.logs.set(null);
    try {
      const detail = await this.api.getRun(id);
      if (!isCurrent()) return;
      this.detail.set(detail);
      this.api.runLogs(id).then(
        (logs) => isCurrent() && this.logs.set(logs),
        () => isCurrent() && this.logs.set([]),
      );
      this.api.getSuite(detail.record.suiteId).then(
        (s) => isCurrent() && this.suite.set(s),
        () => undefined,
      );
      if (detail.rawOutput) {
        try {
          this.result.set(parseHyperfineJSON(detail.rawOutput));
        } catch (e) {
          this.error.set(`Stored output could not be parsed: ${errorMessage(e)}`);
        }
      }
    } catch (e) {
      if (isCurrent()) this.error.set(errorMessage(e));
    }
  }

  async togglePin(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const pin = !this.isBaseline();
    try {
      this.suite.set(await this.api.setBaseline(d.record.suiteId, pin ? d.record.id : null));
      this.toast.show(pin ? "Pinned as the baseline for this suite" : "Baseline cleared");
    } catch (e) {
      this.toast.show(errorMessage(e), "error");
    }
  }

  durationSeconds(d: RunDetail): number {
    return (Date.parse(d.record.finishedAt) - Date.parse(d.record.startedAt)) / 1000;
  }

  private markdown(): string | null {
    const d = this.detail();
    return d ? runToMarkdown(d.record, this.result(), d.config, d.git) : null;
  }

  saveMarkdown(): void {
    const d = this.detail();
    const md = this.markdown();
    if (d && md) this.files.save(exportFileName(d.record.suiteName, "md"), md, "md");
  }

  copyMarkdown(): void {
    const md = this.markdown();
    if (md) this.files.copy(md);
  }

  saveCsv(): void {
    const d = this.detail();
    const r = this.result();
    if (d && r) this.files.save(exportFileName(d.record.suiteName, "csv"), runToCsv(d.record, r), "csv");
  }

  saveExcel(): void {
    const d = this.detail();
    const r = this.result();
    if (d && r) this.files.saveWorkbook(exportFileName(d.record.suiteName, "xlsx"), runToWorkbook(d.record, r, d.git));
  }
}
