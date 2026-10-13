import { Component, computed, input, signal } from "@angular/core";
import { PAGE_SIZE } from "../core/paging";
import { ms } from "../core/format";
import { CaseResult } from "../core/parser/hyperfine.types";
import { RangeStripComponent } from "./range-strip.component";

@Component({
  selector: "app-results-table",
  imports: [RangeStripComponent],
  template: `
    <table>
      <thead>
        <tr>
          <th>Case</th>
          <th class="strip-col">Distribution <span class="faint">(0 – {{ ms(domain(), 1) }})</span></th>
          <th class="r">Mean</th>
          <th class="r">Median</th>
          <th class="r">± Std dev</th>
          <th class="r">Runs</th>
        </tr>
      </thead>
      <tbody>
        @for (c of visible(); track $index) {
          <tr>
            <td>
              {{ c.command }}
              @if (c.hasFailedRuns) {
                <div class="flag">Some runs exited non-zero</div>
              }
            </td>
            <td class="strip-col">
              <app-range-strip
                [min]="c.metrics.min" [max]="c.metrics.max" [mean]="c.metrics.mean"
                [median]="c.metrics.median" [stddev]="c.metrics.stddev" [domain]="domain()" />
            </td>
            <td class="r num strong">{{ ms(c.metrics.mean) }}</td>
            <td class="r num">{{ ms(c.metrics.median) }}</td>
            <td class="r num">{{ ms(c.metrics.stddev) }}</td>
            <td class="r num">{{ c.metrics.times.length || c.metrics.exitCodes.length }}</td>
          </tr>
        }
      </tbody>
    </table>
    @if (hidden() > 0) {
      <button type="button" class="quiet more" (click)="limit.set(limit() + pageSize)">
        Show {{ Math.min(hidden(), pageSize) }} more ({{ hidden() }} hidden)
      </button>
    }
    <p class="faint legend">Whisker: min to max. Band: mean ± one std dev. Long tick: mean. Short tick: median.</p>
  `,
  styles: `
    .strip-col {
      width: 34%;
      min-width: 140px;
      vertical-align: middle;
    }
    td:first-child {
      word-break: break-word;
    }
    .flag {
      font-size: 12px;
      color: var(--warn);
    }
    .legend {
      margin-top: 8px;
      font-size: 12px;
    }
  `,
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
