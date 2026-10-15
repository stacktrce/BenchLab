import { ChartSize, DEFAULT_SIZE, plotArea, Tick, timeTicks } from "./layout";
import { median } from "./numbers";
import { formatInUnit, linearScale, niceTicks, pickUnit, TimeUnit } from "./scale";

export interface ProgressionPoint {
  x: number;
  y: number;
  /** 1-based run number within the measurement. */
  run: number;
  /** Above the zoomed axis; drawn on the top edge. */
  clipped: boolean;
}

export interface ProgressionLayout {
  empty: boolean;
  unit: TimeUnit;
  points: ProgressionPoint[];
  medianY: number;
  xTicks: Tick[];
  yTicks: Tick[];
  /** First timing divided by the median, or null with a single run. A large value is a cold start. */
  firstRunRatio: number | null;
  /** True when a slow outlier squashes the other points, so zooming would help. */
  canZoom: boolean;
  summary: string;
  table: { columns: string[]; rows: string[][] };
}

/** A timing beyond this many medians counts as an outlier that zoom may clip. */
const OUTLIER_FACTOR = 2;
const AXIS_PADDING = 0.1;

/** Timings in the order they ran, so a slow first run or a drift is visible. */
export function layoutProgression(
  times: number[],
  options: { zoom: boolean },
  size: ChartSize = DEFAULT_SIZE,
): ProgressionLayout {
  if (times.length === 0) {
    return {
      empty: true, unit: pickUnit(0), points: [], medianY: 0, xTicks: [], yTicks: [],
      firstRunRatio: null, canZoom: false, summary: "No timings to draw.", table: { columns: [], rows: [] },
    };
  }

  const area = plotArea(size);
  const mid = median(times);
  const limit = mid * OUTLIER_FACTOR;
  const canZoom = times.length > 2 && times.some((t) => t > limit);
  const zoom = options.zoom && canZoom;
  const drawn = zoom ? times.filter((t) => t <= limit) : times;

  const low = Math.min(...drawn);
  const high = Math.max(...drawn);
  const pad = (high - low) * AXIS_PADDING || high * AXIS_PADDING || 1e-6;
  const lo = Math.max(0, low - pad);
  const hi = high + pad;
  const unit = pickUnit(Math.max(...times));

  const y = linearScale([lo, hi], [area.bottom, area.top]);
  const lastRun = times.length;
  const x = lastRun === 1 ? () => (area.left + area.right) / 2 : linearScale([1, lastRun], [area.left, area.right]);

  const points = times.map((t, i) => {
    const clipped = zoom && t > limit;
    return { x: x(i + 1), y: clipped ? area.top : y(t), run: i + 1, clipped };
  });

  const runTicks = niceTicks(1, lastRun, 6).filter((v) => Number.isInteger(v) && v >= 1 && v <= lastRun);
  const clippedCount = points.filter((p) => p.clipped).length;
  const summary =
    `${times.length} runs in order, median ${formatInUnit(mid, unit)} ${unit.unit}, ` +
    `from ${formatInUnit(Math.min(...times), unit)} to ${formatInUnit(Math.max(...times), unit)} ${unit.unit}.` +
    (clippedCount ? ` ${clippedCount} slower runs are off the zoomed axis.` : "");

  return {
    empty: false,
    unit,
    points,
    medianY: y(mid),
    xTicks: runTicks.map((v) => ({ pos: x(v), label: String(v) })),
    yTicks: timeTicks(niceTicks(lo, hi, 5), lo, hi, unit, y),
    firstRunRatio: times.length > 1 && mid > 0 ? times[0] / mid : null,
    canZoom,
    summary,
    table: {
      columns: ["Run", `Time (${unit.unit})`],
      rows: times.map((t, i) => [String(i + 1), formatInUnit(t, unit)]),
    },
  };
}
