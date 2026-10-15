import { Component, computed, input, signal } from "@angular/core";
import { Tone } from "../../core/charts/layout";
import { CaseResult } from "../../core/parser/hyperfine.types";
import { HistogramChartComponent } from "./histogram-chart.component";
import { ProgressionChartComponent } from "./progression-chart.component";

export interface CaseSet {
  label: string;
  cases: CaseResult[];
  tone: Tone;
}

/** The distribution and the run-by-run timings of one case, for one run or for two runs side by side. */
@Component({
  selector: "app-case-charts",
  imports: [HistogramChartComponent, ProgressionChartComponent],
  template: `
    <div class="picker">
      <label>
        <span>Case</span>
        <select #picker (change)="chosen.set(picker.value)">
          @for (name of names(); track name) {
            <option [value]="name" [selected]="name === current()">{{ name }}</option>
          }
        </select>
      </label>
    </div>
    @if (timed().length === 0) {
      <p class="faint">This case has no individual timings, so there is nothing to draw.</p>
    } @else {
      <app-histogram-chart [title]="'Distribution of timings'" [series]="timed()" />
      @for (s of timed(); track s.label) {
        <app-progression-chart [title]="'Timings in run order' + (timed().length > 1 ? ': ' + s.label : '')" [times]="s.times" [tone]="s.tone" />
      }
    }
  `,
  styles: `
    .picker {
      margin-bottom: 12px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 100%;
      font-size: 12px;
      color: var(--ink-2);
    }
    select {
      max-width: 100%;
    }
    app-progression-chart {
      display: block;
      margin-top: 16px;
    }
    .faint {
      color: var(--ink-2);
      font-size: 12px;
    }
  `,
})
export class CaseChartsComponent {
  readonly sets = input.required<CaseSet[]>();

  protected readonly chosen = signal<string | null>(null);
  protected readonly names = computed(() => [...new Set(this.sets().flatMap((s) => s.cases.map((c) => c.command)))]);
  protected readonly current = computed(() => {
    const wanted = this.chosen();
    return wanted && this.names().includes(wanted) ? wanted : (this.names()[0] ?? "");
  });
  /** One entry per set that has this case and kept its individual timings. */
  protected readonly timed = computed(() =>
    this.sets().flatMap((s) => {
      const times = s.cases.find((c) => c.command === this.current())?.metrics.times ?? [];
      return times.length ? [{ label: s.label, tone: s.tone, times }] : [];
    }),
  );
}
