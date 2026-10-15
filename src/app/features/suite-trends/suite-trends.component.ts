import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type { ActiveElement } from "chart.js";
import { ChartPaletteService } from "../../core/chart-palette.service";
import { trendChart } from "../../core/charts/chart-configs";
import { thin, trendPoints } from "../../core/charts/trend";
import { errorMessage } from "../../core/errors";
import { Latest } from "../../core/latest";
import { CasePoint, Suite } from "../../core/models";
import { SuiteApiService } from "../../core/suite-api.service";
import { ChartPanelComponent } from "../../shared/chart-panel/chart-panel.component";

/** Most runs drawn; a longer history is thinned so the chart stays readable. */
const MAX_POINTS = 500;

/** How one case's mean has moved across the runs of a suite. */
@Component({
  selector: "app-suite-trends",
  imports: [RouterLink, ChartPanelComponent],
  templateUrl: "./suite-trends.component.html",
  styleUrl: "./suite-trends.component.scss",
})
export class SuiteTrendsComponent {
  readonly id = input.required<string>();

  private readonly api = inject(SuiteApiService);
  private readonly router = inject(Router);
  private readonly palette = inject(ChartPaletteService).palette;
  private readonly latestSuite = new Latest();
  private readonly latestSeries = new Latest();

  protected readonly suite = signal<Suite | null>(null);
  protected readonly names = signal<string[] | null>(null);
  protected readonly chosen = signal<string | null>(null);
  /** Null while the chosen case's history is loading. */
  protected readonly series = signal<CasePoint[] | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly current = computed(() => {
    const names = this.names() ?? [];
    const wanted = this.chosen();
    return wanted && names.includes(wanted) ? wanted : (names[0] ?? null);
  });
  private readonly drawn = computed(() => thin(trendPoints(this.series() ?? []), MAX_POINTS));
  protected readonly enoughRuns = computed(() => this.drawn().points.length >= 2);
  protected readonly model = computed(() => {
    const suite = this.suite();
    const { points, thinned } = this.drawn();
    const budgetPercent = suite?.cases.find((c) => c.name === this.current())?.budgetPercent ?? null;
    const chart = trendChart({ points, baselineRunId: suite?.baselineRunId ?? null, budgetPercent }, this.palette());
    const onClick = (_: unknown, elements: ActiveElement[]) => {
      const runId = chart.runIds[elements[0]?.index ?? -1];
      if (runId) void this.router.navigate(["/runs", runId]);
    };
    return {
      ...chart,
      config: { ...chart.config, options: { ...chart.config.options, onClick } },
      notes: thinned ? [...chart.notes, "Only every few runs are drawn, to keep the chart readable."] : chart.notes,
    };
  });
  protected readonly rowLinks = computed(() => this.model().runIds.map((id) => ["/runs", id]));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.loadSuite(id));
    });
    effect(() => {
      const name = this.current();
      const id = this.id();
      untracked(() => this.loadSeries(id, name));
    });
  }

  private async loadSuite(id: string): Promise<void> {
    const isCurrent = this.latestSuite.begin();
    this.suite.set(null);
    this.names.set(null);
    this.chosen.set(null);
    this.error.set(null);
    try {
      const [suite, names] = await Promise.all([this.api.getSuite(id), this.api.caseNames(id)]);
      if (!isCurrent()) return;
      this.suite.set(suite);
      this.names.set(names);
    } catch (e) {
      if (isCurrent()) this.error.set(errorMessage(e));
    }
  }

  private async loadSeries(suiteId: string, name: string | null): Promise<void> {
    const isCurrent = this.latestSeries.begin();
    this.series.set(null);
    if (name === null) return;
    try {
      const series = await this.api.caseSeries(suiteId, name);
      if (isCurrent()) this.series.set(series);
    } catch (e) {
      if (isCurrent()) this.error.set(errorMessage(e));
    }
  }
}
