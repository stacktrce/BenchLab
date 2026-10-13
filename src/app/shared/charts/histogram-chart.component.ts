import { Component, computed, input } from "@angular/core";
import { HistogramSeriesInput, layoutHistogram } from "../../core/charts/histogram-layout";
import { DEFAULT_SIZE, plotArea } from "../../core/charts/layout";
import { ChartAxesComponent } from "./chart-axes.component";
import { ChartFrameComponent } from "./chart-frame.component";

@Component({
  selector: "app-histogram-chart",
  imports: [ChartFrameComponent, ChartAxesComponent],
  template: `
    <app-chart-frame [title]="title()" [table]="layout().table">
      @if (layout().empty) {
        <p class="empty">{{ layout().summary }}</p>
      } @else {
        <svg [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height" role="img" [attr.aria-label]="layout().summary">
          <g appChartAxes [size]="size" [xTicks]="layout().xTicks" [yTicks]="layout().yTicks" [xTitle]="layout().unit.unit" yTitle="runs" />
          @for (bar of layout().bars; track $index) {
            <rect
              [class]="'bar ' + series()[bar.series].tone"
              [attr.x]="bar.x"
              [attr.y]="bar.y"
              [attr.width]="bar.width"
              [attr.height]="bar.height"
            />
          }
          @for (mean of layout().means; track mean.series) {
            <line
              [class]="'mean ' + series()[mean.series].tone"
              [attr.x1]="mean.x"
              [attr.x2]="mean.x"
              [attr.y1]="area.top"
              [attr.y2]="area.bottom"
            />
          }
        </svg>
        @if (series().length > 1) {
          <ul class="legend">
            @for (s of series(); track $index) {
              <li [class]="s.tone">{{ s.label }}</li>
            }
          </ul>
        }
      }
    </app-chart-frame>
  `,
  styles: `
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .bar {
      stroke-width: 1;
      fill-opacity: 0.45;
    }
    .mean {
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
    }
    .base,
    .plain {
      fill: var(--ink-2);
      stroke: var(--ink-2);
      color: var(--ink-2);
    }
    .cand {
      fill: var(--accent);
      stroke: var(--accent);
      color: var(--accent);
    }
    .legend {
      display: flex;
      gap: 16px;
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
      font-size: 12px;
    }
    .legend li {
      fill: none;
      stroke: none;
    }
    .legend li::before {
      content: "";
      display: inline-block;
      width: 10px;
      height: 10px;
      margin-right: 6px;
      background: currentColor;
    }
    .empty {
      color: var(--ink-2);
      font-size: 12px;
    }
  `,
})
export class HistogramChartComponent {
  readonly title = input.required<string>();
  readonly series = input.required<HistogramSeriesInput[]>();

  protected readonly size = DEFAULT_SIZE;
  protected readonly area = plotArea(DEFAULT_SIZE);
  protected readonly layout = computed(() => layoutHistogram(this.series(), this.size));
}
