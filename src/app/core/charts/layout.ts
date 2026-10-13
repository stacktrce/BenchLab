import { formatInUnit, TimeUnit } from "./scale";

/** Which colour a series is drawn in: the baseline is quiet, the candidate carries the accent. */
export type Tone = "base" | "cand" | "plain";

export interface Tick {
  /** Pixel position along the axis. */
  pos: number;
  label: string;
}

export interface ChartSize {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export const DEFAULT_SIZE: ChartSize = {
  width: 720,
  height: 240,
  margin: { top: 14, right: 18, bottom: 34, left: 52 },
};

export interface PlotArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const plotArea = (size: ChartSize): PlotArea => ({
  left: size.margin.left,
  right: size.width - size.margin.right,
  top: size.margin.top,
  bottom: size.height - size.margin.bottom,
});

/** Ticks of a time axis, labelled in `unit`, kept inside [lo, hi] with a small tolerance. */
export function timeTicks(values: number[], lo: number, hi: number, unit: TimeUnit, position: (v: number) => number): Tick[] {
  const slack = (hi - lo) * 1e-9;
  return values
    .filter((v) => v >= lo - slack && v <= hi + slack)
    .map((v) => ({ pos: position(v), label: formatInUnit(v, unit) }));
}

/** An SVG path through the points, as straight segments. */
export function linePath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`).join(" ");
}

export const round = (n: number): number => Math.round(n * 100) / 100;
