import { ChartSize, DEFAULT_SIZE, linePath, plotArea, round, Tick, timeTicks } from "./layout";
import { formatInUnit, linearScale, niceTicks, pickUnit, TimeUnit } from "./scale";
import { budgetThreshold, TrendPoint } from "./trend";

export interface TrendInput {
  /** Oldest first. */
  points: TrendPoint[];
  baselineRunId: string | null;
  /** The regression budget in percent, if the suite has one. */
  budgetPercent: number | null;
}

export interface TrendDot {
  runId: string;
  label: string;
  x: number;
  y: number;
  yLow: number | null;
  yHigh: number | null;
  dirty: boolean;
  isBaseline: boolean;
}

export interface TrendLayout {
  empty: boolean;
  unit: TimeUnit;
  points: TrendDot[];
  line: string;
  /** Closed shapes, one per stretch of consecutive runs with a known spread. */
  bandPaths: string[];
  budgetY: number | null;
  xTicks: Tick[];
  yTicks: Tick[];
  /** The y axis is zoomed to the data, which exaggerates change; the chart says so. */
  axisNote: string | null;
  summary: string;
  table: { columns: string[]; rows: string[][] };
}

const AXIS_PADDING = 0.15;
const MAX_X_LABELS = 6;

/** Means over time, oldest to newest, with the 95% band where it is known. */
export function layoutTrend(input: TrendInput, size: ChartSize = DEFAULT_SIZE): TrendLayout {
  const { points, baselineRunId, budgetPercent } = input;
  if (points.length === 0) {
    return {
      empty: true, unit: pickUnit(0), points: [], line: "", bandPaths: [], budgetY: null, xTicks: [], yTicks: [],
      axisNote: null, summary: "No runs to draw.", table: { columns: [], rows: [] },
    };
  }

  const area = plotArea(size);
  const baseline = points.find((p) => p.runId === baselineRunId);
  const budget = baseline && budgetPercent !== null ? budgetThreshold(baseline.mean, budgetPercent) : null;

  const values = [
    ...points.flatMap((p) => [p.mean, p.low ?? p.mean, p.high ?? p.mean]),
    ...(budget === null ? [] : [budget]),
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * AXIS_PADDING || max * 0.05 || 1e-6;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const unit = pickUnit(hi);

  const y = linearScale([lo, hi], [area.bottom, area.top]);
  const last = points.length - 1;
  const x = (i: number) => (last === 0 ? (area.left + area.right) / 2 : area.left + ((area.right - area.left) * i) / last);

  const dots: TrendDot[] = points.map((p, i) => ({
    runId: p.runId,
    label: p.label,
    x: x(i),
    y: y(p.mean),
    yLow: p.low === null ? null : y(p.low),
    yHigh: p.high === null ? null : y(p.high),
    dirty: p.dirty,
    isBaseline: p.runId === baselineRunId,
  }));

  const stretches: TrendDot[][] = [];
  for (const dot of dots) {
    if (dot.yHigh === null) {
      stretches.push([]);
    } else {
      if (stretches.length === 0) stretches.push([]);
      stretches[stretches.length - 1].push(dot);
    }
  }
  const bandPaths = stretches
    .filter((s) => s.length >= 2)
    .map((s) => {
      const top = s.map((d) => ({ x: d.x, y: d.yHigh as number }));
      const bottom = s.map((d) => ({ x: d.x, y: d.yLow as number })).reverse();
      return `${linePath([...top, ...bottom])} Z`;
    });

  const stride = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));
  const xTicks = points.flatMap((p, i) => (i % stride === 0 ? [{ pos: round(x(i)), label: p.label }] : []));

  const first = points[0];
  const newest = points[last];
  const summary =
    `Mean over ${points.length} runs, from ${first.label} to ${newest.label}: ` +
    `${formatInUnit(first.mean, unit)} ${unit.unit} to ${formatInUnit(newest.mean, unit)} ${unit.unit}.` +
    (budget === null ? "" : ` Budget line at ${formatInUnit(budget, unit)} ${unit.unit}.`);

  return {
    empty: false,
    unit,
    points: dots,
    line: linePath(dots),
    bandPaths,
    budgetY: budget === null ? null : y(budget),
    xTicks,
    yTicks: timeTicks(niceTicks(lo, hi, 5), lo, hi, unit, y),
    axisNote: lo > 0 ? "The time axis does not start at 0." : null,
    summary,
    table: {
      columns: ["Run", "Date", `Mean (${unit.unit})`, `95% low (${unit.unit})`, `95% high (${unit.unit})`, "Note"],
      rows: points.map((p) => [
        p.label,
        p.startedAt.slice(0, 10),
        formatInUnit(p.mean, unit),
        p.low === null ? "unknown" : formatInUnit(p.low, unit),
        p.high === null ? "unknown" : formatInUnit(p.high, unit),
        [p.runId === baselineRunId ? "baseline" : "", p.dirty ? "uncommitted changes" : ""].filter(Boolean).join(", "),
      ]),
    },
  };
}
