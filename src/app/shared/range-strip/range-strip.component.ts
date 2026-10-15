import { Component, computed, input } from "@angular/core";

/**
 * One timing distribution on a shared 0..domain axis:
 * whisker = min..max, band = mean ± one std dev, long tick = mean, short tick = median.
 */
@Component({
  selector: "app-range-strip",
  templateUrl: "./range-strip.component.html",
  styleUrl: "./range-strip.component.scss",
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
