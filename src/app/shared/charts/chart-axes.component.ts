import { Component, computed, input } from "@angular/core";
import { ChartSize, plotArea, Tick } from "../../core/charts/layout";

/** Hairline grid, tick labels and the unit of a chart, drawn inside an SVG. */
@Component({
  selector: "svg:g[appChartAxes]",
  template: `
    @for (tick of yTicks(); track $index) {
      <svg:line class="grid" [attr.x1]="area().left" [attr.x2]="area().right" [attr.y1]="tick.pos" [attr.y2]="tick.pos" />
      <svg:text class="tick" text-anchor="end" [attr.x]="area().left - 6" [attr.y]="tick.pos" dy="0.32em">{{ tick.label }}</svg:text>
    }
    <svg:line class="axis" [attr.x1]="area().left" [attr.x2]="area().right" [attr.y1]="area().bottom" [attr.y2]="area().bottom" />
    @for (tick of xTicks(); track $index) {
      <svg:line class="axis" [attr.x1]="tick.pos" [attr.x2]="tick.pos" [attr.y1]="area().bottom" [attr.y2]="area().bottom + 4" />
      <svg:text class="tick" text-anchor="middle" [attr.x]="tick.pos" [attr.y]="area().bottom + 16">{{ tick.label }}</svg:text>
    }
    @if (xTitle(); as title) {
      <svg:text class="tick" text-anchor="end" [attr.x]="area().right" [attr.y]="size().height - 4">{{ title }}</svg:text>
    }
    @if (yTitle(); as title) {
      <svg:text class="tick" text-anchor="start" x="2" [attr.y]="area().top - 4">{{ title }}</svg:text>
    }
  `,
  styles: `
    .grid {
      stroke: var(--line);
    }
    .axis {
      stroke: var(--line-strong);
    }
    .tick {
      fill: var(--ink-2);
      font-family: var(--mono);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class ChartAxesComponent {
  readonly size = input.required<ChartSize>();
  readonly xTicks = input<Tick[]>([]);
  readonly yTicks = input<Tick[]>([]);
  readonly xTitle = input<string | null>(null);
  readonly yTitle = input<string | null>(null);

  protected readonly area = computed(() => plotArea(this.size()));
}
