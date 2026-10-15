import { Component, computed, input, signal } from "@angular/core";
import { DEFAULT_SIZE, plotArea, Tone } from "../../core/charts/layout";
import { layoutProgression } from "../../core/charts/progression-layout";
import { ChartAxesComponent } from "./chart-axes.component";
import { ChartFrameComponent } from "./chart-frame.component";

/** Timings in run order. A cold first run or a drift shows up here and not in a histogram. */
@Component({
  selector: "app-progression-chart",
  imports: [ChartFrameComponent, ChartAxesComponent],
  template: `
    <app-chart-frame [title]="title()" [table]="layout().table" [note]="note()">
      @if (layout().canZoom) {
        <label chartTools class="zoom">
          <input type="checkbox" [checked]="zoom()" (change)="zoom.set(!zoom())" />
          Zoom past slow runs
        </label>
      }
      @if (layout().empty) {
        <p class="empty">{{ layout().summary }}</p>
      } @else {
        <svg [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height" role="img" [attr.aria-label]="layout().summary">
          <g appChartAxes [size]="size" [xTicks]="layout().xTicks" [yTicks]="layout().yTicks" xTitle="run" [yTitle]="layout().unit.unit" />
          <line [class]="'median ' + tone()" [attr.x1]="area.left" [attr.x2]="area.right" [attr.y1]="layout().medianY" [attr.y2]="layout().medianY" />
          @for (point of layout().points; track point.run) {
            @if (point.clipped) {
              <path [class]="'dot ' + tone()" [attr.d]="clippedMarker(point.x, point.y)" />
            } @else {
              <circle [class]="'dot ' + tone()" [attr.cx]="point.x" [attr.cy]="point.y" r="3" />
            }
          }
        </svg>
      }
    </app-chart-frame>
  `,
  styles: `
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .dot {
      stroke-width: 0;
    }
    .median {
      stroke-width: 1;
      stroke-dasharray: 4 3;
    }
    .base,
    .plain {
      fill: var(--ink-2);
      stroke: var(--ink-2);
    }
    .cand {
      fill: var(--accent);
      stroke: var(--accent);
    }
    .zoom {
      color: var(--ink-2);
      font-size: 12px;
    }
    .empty {
      color: var(--ink-2);
      font-size: 12px;
    }
  `,
})
export class ProgressionChartComponent {
  readonly title = input.required<string>();
  readonly times = input.required<number[]>();
  readonly tone = input<Tone>("plain");

  protected readonly size = DEFAULT_SIZE;
  protected readonly area = plotArea(DEFAULT_SIZE);
  protected readonly zoom = signal(false);
  protected readonly layout = computed(() => layoutProgression(this.times(), { zoom: this.zoom() }, this.size));
  protected readonly note = computed(() => {
    const ratio = this.layout().firstRunRatio;
    return ratio !== null && ratio >= 2
      ? `The first run took ${ratio.toFixed(1)} times the median: likely a cold start.`
      : null;
  });

  /** An upward triangle: the run is slower than the axis shows. */
  protected clippedMarker(x: number, y: number): string {
    return `M${x - 4} ${y + 6}L${x} ${y}L${x + 4} ${y + 6}Z`;
  }
}
