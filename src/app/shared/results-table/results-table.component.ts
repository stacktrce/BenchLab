import { Component, computed, input, signal } from "@angular/core";
import { PAGE_SIZE } from "../../core/paging";
import { ms } from "../../core/format";
import { CaseResult } from "../../core/parser/hyperfine.types";
import { RangeStripComponent } from "../range-strip/range-strip.component";

@Component({
  selector: "app-results-table",
  imports: [RangeStripComponent],
  templateUrl: "./results-table.component.html",
  styleUrl: "./results-table.component.scss",
})
export class ResultsTableComponent {
  readonly cases = input.required<CaseResult[]>();
  protected readonly pageSize = PAGE_SIZE;
  protected readonly Math = Math;
  protected readonly limit = signal(PAGE_SIZE);
  /** Shared axis over every case, not just the rendered ones, so strips do not rescale on "show more". */
  protected readonly domain = computed(() => this.cases().reduce((m, c) => Math.max(m, c.metrics.max), 0));
  protected readonly visible = computed(() => this.cases().slice(0, this.limit()));
  protected readonly hidden = computed(() => Math.max(0, this.cases().length - this.limit()));
  protected readonly ms = ms;
}
