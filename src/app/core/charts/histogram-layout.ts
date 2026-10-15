import { sharedHistograms } from "./histogram";
import { ChartSize, DEFAULT_SIZE, plotArea, Tick, timeTicks, Tone } from "./layout";
import { mean, median } from "./numbers";
import { formatInUnit, linearScale, niceTicks, pickUnit, TimeUnit } from "./scale";

export interface HistogramSeriesInput {
  label: string;
  times: number[];
  tone: Tone;
}

export interface Bar {
  /** Index into the input series. */
  series: number;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  from: number;
  to: number;
}

export interface HistogramLayout {
  empty: boolean;
  unit: TimeUnit;
  xTicks: Tick[];
  yTicks: Tick[];
  bars: Bar[];
  means: { series: number; x: number }[];
  /** The chart in words, for screen readers. */
  summary: string;
  /** The same numbers as a table, one count column per series. */
  table: { columns: string[]; rows: string[][] };
}

const EMPTY_SUMMARY = "No timings to draw.";

/** Turns timing sets into bars on one shared axis. Identical timings become one visible, centred bar. */
export function layoutHistogram(series: HistogramSeriesInput[], size: ChartSize = DEFAULT_SIZE): HistogramLayout {
  const all = series.flatMap((s) => s.times);
  if (all.length === 0) {
    return {
      empty: true, unit: pickUnit(0), xTicks: [], yTicks: [], bars: [], means: [],
      summary: EMPTY_SUMMARY, table: { columns: [], rows: [] },
    };
  }

  const area = plotArea(size);
  const hists = sharedHistograms(series.map((s) => s.times));
  const edges = hists[0].edges;
  const dataMin = edges[0];
  const dataMax = edges[edges.length - 1];
  const pad = dataMin === dataMax ? Math.abs(dataMin) * 0.05 || 1e-6 : 0;
  const lo = dataMin - pad;
  const hi = dataMax + pad;
  const unit = pickUnit(hi);

  const x = linearScale([lo, hi], [area.left, area.right]);
  const maxCount = Math.max(1, ...hists.flatMap((h) => h.counts));
  const y = linearScale([0, maxCount], [area.bottom, area.top]);

  const bars: Bar[] = [];
  hists.forEach((h, s) => {
    h.counts.forEach((count, i) => {
      if (count === 0) return;
      const from = edges[i];
      const to = edges[i + 1];
      const flat = to === from;
      const width = flat ? (area.right - area.left) * 0.06 : Math.max(x(to) - x(from) - 1, 1);
      const left = flat ? x(from) - width / 2 : x(from);
      bars.push({ series: s, x: left, y: y(count), width, height: area.bottom - y(count), count, from, to });
    });
  });

  const describe = (s: HistogramSeriesInput) => {
    const sorted = [...s.times].sort((a, b) => a - b);
    const range = `${formatInUnit(sorted[0], unit)} to ${formatInUnit(sorted[sorted.length - 1], unit)} ${unit.unit}`;
    return `${s.times.length} timings from ${range}, median ${formatInUnit(median(s.times), unit)} ${unit.unit}`;
  };
  const summary =
    series.length === 1
      ? `Histogram of ${describe(series[0])}.`
      : `Histogram comparing ${series.length} sets of timings. ${series
          .map((s) => (s.times.length ? `${s.label}: ${describe(s)}` : `${s.label}: no timings`))
          .join(". ")}.`;

  return {
    empty: false,
    unit,
    xTicks: timeTicks(niceTicks(lo, hi, 6), lo, hi, unit, x),
    yTicks: niceTicks(0, maxCount, 4)
      .filter((v) => Number.isInteger(v))
      .map((v) => ({ pos: y(v), label: String(v) })),
    bars,
    means: series.flatMap((s, i) => (s.times.length ? [{ series: i, x: x(mean(s.times)) }] : [])),
    summary,
    table: {
      columns: [`From (${unit.unit})`, `To (${unit.unit})`, ...series.map((s) => s.label)],
      rows: hists[0].counts.map((_, i) => [
        formatInUnit(edges[i], unit),
        formatInUnit(edges[i + 1], unit),
        ...hists.map((h) => String(h.counts[i])),
      ]),
    },
  };
}
