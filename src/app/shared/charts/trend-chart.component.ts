import { Component, computed, input, output, signal } from "@angular/core";
import { DEFAULT_SIZE, plotArea } from "../../core/charts/layout";
import { TrendPoint } from "../../core/charts/trend";
import { layoutTrend } from "../../core/charts/trend-layout";
import { formatInUnit } from "../../core/charts/scale";
import { ChartAxesComponent } from "./chart-axes.component";
import { ChartFrameComponent } from "./chart-frame.component";

/**
 * Mean per run over time. The plot is one tab stop: arrow keys move between runs, a live
 * line reads the current run out, and Enter opens it.
 */
@Component({
  selector: "app-trend-chart",
  imports: [ChartFrameComponent, ChartAxesComponent],
  template: `
    <app-chart-frame [title]="title()" [table]="layout().table" [note]="layout().axisNote">
      @if (layout().empty) {
        <p class="empty">{{ layout().summary }}</p>
      } @else {
        <div
          class="plot"
          tabindex="0"
          role="group"
          [attr.aria-label]="layout().summary + ' Use the arrow keys to move between runs and Enter to open one.'"
          (keydown)="onKey($event)"
        >
          <svg [attr.viewBox]="'0 0 ' + size.width + ' ' + size.height" aria-hidden="true">
            <g appChartAxes [size]="size" [xTicks]="layout().xTicks" [yTicks]="layout().yTicks" [yTitle]="layout().unit.unit" />
            @for (path of layout().bandPaths; track $index) {
              <path class="band" [attr.d]="path" />
            }
            @for (point of layout().points; track point.runId) {
              @if (point.yHigh !== null && point.yLow !== null) {
                <line class="whisker" [attr.x1]="point.x" [attr.x2]="point.x" [attr.y1]="point.yHigh" [attr.y2]="point.yLow" />
              }
            }
            @if (layout().budgetY !== null) {
              <line class="budget" [attr.x1]="area.left" [attr.x2]="area.right" [attr.y1]="layout().budgetY" [attr.y2]="layout().budgetY" />
              <text class="budget-label" text-anchor="end" [attr.x]="area.right" [attr.y]="(layout().budgetY ?? 0) - 4">budget</text>
            }
            <path class="line" [attr.d]="layout().line" />
            @for (point of layout().points; track point.runId; let i = $index) {
              <circle
                class="dot"
                [class.dirty]="point.dirty"
                [class.baseline]="point.isBaseline"
                [class.active]="i === active()"
                [attr.cx]="point.x"
                [attr.cy]="point.y"
                [attr.r]="point.isBaseline ? 5 : 3.5"
              />
            }
          </svg>
        </div>
        <p class="readout" aria-live="polite">{{ readout() }}</p>
      }
    </app-chart-frame>
  `,
  styles: `
    .plot {
      border-radius: 2px;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .line {
      fill: none;
      stroke: var(--ink-2);
      stroke-width: 1.5;
    }
    .band {
      fill: var(--ink-2);
      fill-opacity: 0.16;
      stroke: none;
    }
    .whisker {
      stroke: var(--ink-2);
      stroke-opacity: 0.5;
    }
    .dot {
      fill: var(--ink-2);
      stroke: var(--bg);
      stroke-width: 1;
    }
    .dot.dirty {
      fill: var(--bg);
      stroke: var(--ink-2);
      stroke-width: 1.5;
    }
    .dot.baseline {
      fill: var(--accent);
      stroke: var(--bg);
    }
    .plot:focus-within .dot.active {
      stroke: var(--focus);
      stroke-width: 2;
    }
    .budget {
      stroke: var(--warn);
      stroke-width: 1.5;
      stroke-dasharray: 6 4;
    }
    .budget-label {
      fill: var(--warn);
      font-size: 11px;
      font-family: var(--mono);
    }
    .readout {
      min-height: 1.4em;
      margin: 4px 0 0;
      color: var(--ink-2);
      font-size: 12px;
    }
    .empty {
      color: var(--ink-2);
      font-size: 12px;
    }
  `,
})
export class TrendChartComponent {
  readonly title = input.required<string>();
  readonly points = input.required<TrendPoint[]>();
  readonly baselineRunId = input<string | null>(null);
  readonly budgetPercent = input<number | null>(null);
  readonly selectRun = output<string>();

  protected readonly size = DEFAULT_SIZE;
  protected readonly area = plotArea(DEFAULT_SIZE);
  /** Index of the run the keyboard is on; the newest run until the user moves. */
  private readonly cursor = signal<number | null>(null);
  protected readonly layout = computed(() =>
    layoutTrend({ points: this.points(), baselineRunId: this.baselineRunId(), budgetPercent: this.budgetPercent() }, this.size),
  );
  protected readonly active = computed(() => Math.min(this.cursor() ?? this.points().length - 1, this.points().length - 1));
  protected readonly readout = computed(() => {
    const point = this.points()[this.active()];
    if (!point) return "";
    const { unit } = this.layout();
    const notes = [point.runId === this.baselineRunId() ? "baseline" : "", point.dirty ? "uncommitted changes" : ""];
    return [`${point.label}: ${formatInUnit(point.mean, unit)} ${unit.unit}`, ...notes].filter(Boolean).join(", ");
  });

  protected onKey(event: KeyboardEvent): void {
    const last = this.points().length - 1;
    const moves: Record<string, number> = {
      ArrowLeft: this.active() - 1,
      ArrowRight: this.active() + 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      this.cursor.set(Math.max(0, Math.min(last, moves[event.key])));
    } else if (event.key === "Enter" && this.points()[this.active()]) {
      event.preventDefault();
      this.selectRun.emit(this.points()[this.active()].runId);
    }
  }
}
