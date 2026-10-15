import { Component, computed, inject, input, signal } from "@angular/core";
import { histogramChart, runOrderChart, TimingSeries } from "../../core/charts/chart-configs";
import { Tone } from "../../core/charts/palette";
import { ChartPaletteService } from "../../core/chart-palette.service";
import { CaseResult } from "../../core/parser/hyperfine.types";
import { ChartPanelComponent } from "../chart-panel/chart-panel.component";

export interface CaseSet {
  label: string;
  cases: CaseResult[];
  tone: Tone;
}

/** Histogram and run order of one case, for one run or for two runs on the same axes. */
@Component({
  selector: "app-timing-charts",
  imports: [ChartPanelComponent],
  templateUrl: "./timing-charts.component.html",
  styleUrl: "./timing-charts.component.scss",
})
export class TimingChartsComponent {
  readonly sets = input.required<CaseSet[]>();

  private readonly palette = inject(ChartPaletteService).palette;
  protected readonly chosen = signal<string | null>(null);
  protected readonly zoom = signal(false);

  protected readonly names = computed(() => [...new Set(this.sets().flatMap((s) => s.cases.map((c) => c.command)))]);
  protected readonly current = computed(() => {
    const wanted = this.chosen();
    return wanted && this.names().includes(wanted) ? wanted : (this.names()[0] ?? "");
  });
  private readonly series = computed<TimingSeries[]>(() =>
    this.sets().map((s) => ({
      label: s.label,
      tone: s.tone,
      times: s.cases.find((c) => c.command === this.current())?.metrics.times ?? [],
    })),
  );
  protected readonly histogram = computed(() => histogramChart(this.series(), this.palette()));
  protected readonly runOrder = computed(() => runOrderChart(this.series(), { zoom: this.zoom() }, this.palette()));

  protected pick(name: string): void {
    this.chosen.set(name);
    this.zoom.set(false);
  }
}
