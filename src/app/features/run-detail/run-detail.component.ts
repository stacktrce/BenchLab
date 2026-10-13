import { DatePipe } from "@angular/common";
import { Component, effect, inject, input, signal, untracked } from "@angular/core";
import { RouterLink } from "@angular/router";
import { exportFileName, FileExportService } from "../../core/file-export.service";
import { runToCsv, runToMarkdown } from "../../core/export";
import { describeGit } from "../../core/format";
import { RunDetail } from "../../core/models";
import { parseHyperfineJSON } from "../../core/parser/hyperfine.parser";
import { BenchmarkResult } from "../../core/parser/hyperfine.types";
import { SuiteApiService } from "../../core/suite-api.service";
import { IconComponent } from "../../shared/icon.component";
import { ResultsTableComponent } from "../../shared/results-table.component";

@Component({
  selector: "app-run-detail",
  imports: [DatePipe, RouterLink, ResultsTableComponent, IconComponent],
  templateUrl: "./run-detail.component.html",
})
export class RunDetailComponent {
  readonly id = input.required<string>();

  protected readonly describeGit = describeGit;

  private readonly api = inject(SuiteApiService);
  private readonly files = inject(FileExportService);

  readonly detail = signal<RunDetail | null>(null);
  readonly result = signal<BenchmarkResult | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    this.detail.set(null);
    this.result.set(null);
    this.error.set(null);
    try {
      const detail = await this.api.getRun(id);
      this.detail.set(detail);
      if (detail.rawOutput) {
        try {
          this.result.set(parseHyperfineJSON(detail.rawOutput));
        } catch (e) {
          this.error.set(`Stored output could not be parsed: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      this.error.set(String(e));
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
}
