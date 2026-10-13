import { Component, computed, input } from "@angular/core";

/**
 * One timing distribution on a shared 0..domain axis:
 * whisker = min..max, band = mean ± one std dev, long tick = mean, short tick = median.
 */
@Component({
  selector: "app-range-strip",
  template: `
    <svg viewBox="0 0 100 12" preserveAspectRatio="none" role="img" [attr.aria-label]="label()">
      <line class="whisker" [attr.x1]="x(min())" [attr.x2]="x(max())" y1="6" y2="6" />
      @if (band(); as b) {
        <rect class="band" [attr.x]="b.x" [attr.width]="b.w" y="3" height="6" />
      }
      <line class="median" [attr.x1]="x(median())" [attr.x2]="x(median())" y1="4" y2="8" />
      <line class="mean" [attr.x1]="x(mean())" [attr.x2]="x(mean())" y1="0" y2="12" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      color: var(--ink-2);
    }
    :host(.base) {
      color: var(--ink-3);
    }
    :host(.cand) {
      color: var(--accent);
    }
    svg {
      display: block;
      width: 100%;
      height: 12px;
      overflow: visible;
    }
    line {
      stroke: currentColor;
      vector-effect: non-scaling-stroke;
    }
    .whisker {
      stroke-width: 1;
      opacity: 0.55;
    }
    .band {
      fill: currentColor;
      opacity: 0.28;
    }
    .median {
      stroke-width: 1;
    }
    .mean {
      stroke-width: 2;
    }
  `,
})
export class RangeStripComponent {
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly mean = input.required<number>();
  readonly median = input.required<number>();
  readonly stddev = input<number | null>(null);
  /** Axis end in seconds; share it across strips that should be compared by eye. */
  readonly domain = input.required<number>();

  protected readonly label = computed(
    () =>
      `min ${(this.min() * 1000).toFixed(2)} ms, mean ${(this.mean() * 1000).toFixed(2)} ms, max ${(this.max() * 1000).toFixed(2)} ms`,
  );

  protected readonly band = computed(() => {
    const sd = this.stddev();
    if (sd === null) return null;
    const lo = this.x(this.mean() - sd);
    const hi = this.x(this.mean() + sd);
    return { x: lo, w: Math.max(hi - lo, 0.4) };
  });

  protected x(v: number): number {
    const d = this.domain();
    return d > 0 ? Math.min(100, Math.max(0, (v / d) * 100)) : 0;
  }
}
