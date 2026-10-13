import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { Router } from "@angular/router";
import { thin, trendPoints } from "../../core/charts/trend";
import { errorMessage } from "../../core/errors";
import { Latest } from "../../core/latest";
import { CasePoint, Suite } from "../../core/models";
import { SuiteApiService } from "../../core/suite-api.service";
import { TrendChartComponent } from "../../shared/charts/trend-chart.component";

/** Most points the chart draws; a longer history is thinned so it stays readable. */
const MAX_POINTS = 500;

/** How one case's mean has moved across the runs of a suite. */
@Component({
  selector: "app-trends-panel",
  imports: [TrendChartComponent],
  template: `
    @if (error(); as message) {
      <div class="note error" role="alert">{{ message }}</div>
    } @else if (names().length === 0) {
      <div class="empty"><strong>No results to chart yet</strong>Trends need at least one completed run.</div>
    } @else {
      <label class="picker">
        <span>Case</span>
        <select #picker (change)="chosen.set(picker.value)">
          @for (name of names(); track name) {
            <option [value]="name" [selected]="name === current()">{{ name }}</option>
          }
        </select>
      </label>
      @if (drawn().points.length < 2) {
        <p class="faint">A trend needs two runs that include this case.</p>
      } @else {
        <app-trend-chart
          [title]="'Mean time per run: ' + current()"
          [points]="drawn().points"
          [baselineRunId]="suite().baselineRunId ?? null"
          [budgetPercent]="budgetPercent()"
          (selectRun)="openRun($event)"
        />
        <p class="faint note-line">
          Failed runs are left out.
          @if (drawn().thinned) {
            Only every few runs are drawn, to keep the chart readable.
          }
          @if (budgetPercent() !== null && !hasBaselinePoint()) {
            The pinned baseline has no result for this case, so the budget line is not drawn.
          }
        </p>
      }
    }
  `,
  styles: `
    .picker {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--ink-2);
    }
    .faint {
      color: var(--ink-2);
      font-size: 12px;
    }
    .note-line {
      margin-top: 8px;
    }
  `,
})
export class TrendsPanelComponent {
  readonly suite = input.required<Suite>();

  private readonly api = inject(SuiteApiService);
  private readonly router = inject(Router);
  private readonly latestNames = new Latest();
  private readonly latestSeries = new Latest();

  protected readonly names = signal<string[]>([]);
  protected readonly chosen = signal<string | null>(null);
  protected readonly series = signal<CasePoint[]>([]);
  protected readonly error = signal<string | null>(null);

  protected readonly current = computed(() => {
    const wanted = this.chosen();
    return wanted && this.names().includes(wanted) ? wanted : (this.names()[0] ?? null);
  });
  protected readonly drawn = computed(() => {
    const { points, thinned } = thin(trendPoints(this.series()), MAX_POINTS);
    return { points, thinned };
  });
  protected readonly budgetPercent = computed(
    () => this.suite().cases.find((c) => c.name === this.current())?.budgetPercent ?? null,
  );
  protected readonly hasBaselinePoint = computed(() =>
    this.series().some((p) => p.runId === this.suite().baselineRunId),
  );

  constructor() {
    effect(() => {
      const id = this.suite().id;
      untracked(() => this.loadNames(id));
    });
    effect(() => {
      const name = this.current();
      const id = this.suite().id;
      untracked(() => this.loadSeries(id, name));
    });
  }

  protected openRun(runId: string): void {
    void this.router.navigate(["/runs", runId]);
  }

  private async loadNames(suiteId: string): Promise<void> {
    const isCurrent = this.latestNames.begin();
    try {
      const names = await this.api.caseNames(suiteId);
      if (!isCurrent()) return;
      this.error.set(null);
      this.chosen.set(null);
      this.names.set(names);
    } catch (e) {
      if (isCurrent()) this.error.set(errorMessage(e));
    }
  }

  private async loadSeries(suiteId: string, name: string | null): Promise<void> {
    const isCurrent = this.latestSeries.begin();
    if (name === null) {
      this.series.set([]);
      return;
    }
    try {
      const series = await this.api.caseSeries(suiteId, name);
      if (isCurrent()) this.series.set(series);
    } catch (e) {
      if (isCurrent()) this.error.set(errorMessage(e));
    }
  }
}
