import { Component, computed, input, linkedSignal, signal } from "@angular/core";
import { ComparisonRow, summarize } from "../../../core/compare";
import { ms, percent, signedMs } from "../../../core/format";
import { PAGE_SIZE } from "../../../core/paging";
import { RangeStripComponent } from "../../../shared/range-strip/range-strip.component";

/** The verdict per case with its interval, plus the caveats and the method behind it. */
@Component({
  selector: "app-comparison-table",
  imports: [RangeStripComponent],
  templateUrl: "./comparison-table.component.html",
  styleUrl: "./comparison-table.component.scss",
})
export class ComparisonTableComponent {
  readonly rows = input.required<ComparisonRow[]>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly Math = Math;
  protected readonly ms = ms;
  protected readonly signedMs = signedMs;
  protected readonly percent = percent;

  protected readonly hideNoise = signal(false);
  /** Back to one page whenever a new comparison arrives. */
  protected readonly limit = linkedSignal({ source: this.rows, computation: () => PAGE_SIZE });

  protected readonly summary = computed(() => summarize(this.rows()));
  protected readonly shown = computed(() =>
    this.hideNoise() ? this.rows().filter((r) => r.kind !== "matched" || r.verdict !== "inconclusive") : this.rows(),
  );
  protected readonly visibleRows = computed(() => this.shown().slice(0, this.limit()));
  protected readonly hiddenCount = computed(() => Math.max(0, this.shown().length - this.limit()));
  /** Cases whose evidence is weak, for the aggregated note under the table. */
  protected readonly flagged = computed(() => this.rows().filter((r) => r.kind === "matched" && r.caveats.length));

  /** Shared axis per row so both strips can be compared by eye. */
  protected domain(row: ComparisonRow): number {
    return Math.max(row.baseline?.max ?? 0, row.candidate?.max ?? 0);
  }
}
