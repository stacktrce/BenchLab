import type { ChartConfiguration, ChartDataset, ScaleOptions } from "chart.js";
import { sharedHistograms } from "./histogram";
import { median } from "./numbers";
import { ChartPalette, Tone, toneColor, withAlpha } from "./palette";
import { formatInUnit, pickUnit, TimeUnit } from "./scale";
import { budgetThreshold, TrendPoint } from "./trend";

export interface DataTable {
  columns: string[];
  rows: string[][];
}

/** A chart ready for Chart.js, with the same content in words and as a table. */
export interface ChartModel<T extends "bar" | "line"> {
  empty: boolean;
  unit: TimeUnit;
  config: ChartConfiguration<T>;
  /** The chart in words, for screen readers. */
  summary: string;
  /** Caveats a reader needs next to the picture. */
  notes: string[];
  table: DataTable;
}

export interface TimingSeries {
  label: string;
  /** Seconds. */
  times: number[];
  tone: Tone;
}

const EMPTY_TABLE: DataTable = { columns: [], rows: [] };

/** Long category labels (commits, bin edges) are thinned instead of rotated into a slant. */
const UNCROWDED_TICKS = { autoSkip: true, maxRotation: 0, maxTicksLimit: 8 };

/** A bin edge with only as many decimals as the bin width needs, so labels stay short. */
export function binLabel(seconds: number, widthSeconds: number, unit: TimeUnit): string {
  const width = widthSeconds * unit.factor;
  const decimals = width > 0 ? Math.min(3, Math.max(0, 1 - Math.floor(Math.log10(width)))) : 3;
  return (seconds * unit.factor).toFixed(decimals);
}

function axis(palette: ChartPalette, title: string, extra: ScaleOptions<"linear"> | object = {}) {
  return {
    title: { display: true, text: title, color: palette.muted, font: { family: palette.font, size: 12 } },
    ticks: { color: palette.muted, font: { family: palette.mono, size: 11 } },
    grid: { color: palette.grid },
    border: { color: palette.grid },
    ...extra,
  };
}

function baseOptions(palette: ChartPalette, showLegend: boolean) {
  return {
    animation: false as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        labels: { color: palette.ink, font: { family: palette.font, size: 12 }, boxWidth: 12 },
      },
      tooltip: { titleFont: { family: palette.font }, bodyFont: { family: palette.mono } },
    },
  };
}

function emptyModel<T extends "bar" | "line">(type: T, summary: string): ChartModel<T> {
  return {
    empty: true,
    unit: pickUnit(0),
    config: { type, data: { datasets: [] } } as ChartConfiguration<T>,
    summary,
    notes: [],
    table: EMPTY_TABLE,
  };
}

const range = (times: number[], unit: TimeUnit) =>
  `${formatInUnit(Math.min(...times), unit)} to ${formatInUnit(Math.max(...times), unit)} ${unit.unit}`;

/** Timings binned on shared edges, so two runs can be compared bar for bar. */
export function histogramChart(series: TimingSeries[], palette: ChartPalette): ChartModel<"bar"> {
  const all = series.flatMap((s) => s.times);
  if (all.length === 0) return emptyModel("bar", "No timings to draw.");

  const unit = pickUnit(Math.max(...all));
  const hists = sharedHistograms(series.map((s) => s.times));
  const edges = hists[0].edges;
  const describe = (s: TimingSeries) =>
    s.times.length
      ? `${s.label}: ${s.times.length} timings from ${range(s.times, unit)}, median ${formatInUnit(median(s.times), unit)} ${unit.unit}`
      : `${s.label}: no timings`;

  const datasets: ChartDataset<"bar", number[]>[] = series.map((s, i) => ({
    label: s.label,
    data: hists[i].counts,
    backgroundColor: withAlpha(toneColor(s.tone, palette), 0.45),
    borderColor: toneColor(s.tone, palette),
    borderWidth: 1,
    barPercentage: 1,
    categoryPercentage: 0.9,
  }));

  return {
    empty: false,
    unit,
    config: {
      type: "bar",
      data: { labels: hists[0].counts.map((_, i) => binLabel(edges[i], edges[1] - edges[0], unit)), datasets },
      options: {
        ...baseOptions(palette, series.length > 1),
        scales: {
          x: axis(palette, `Bin start (${unit.unit})`, {
            ticks: { ...UNCROWDED_TICKS, color: palette.muted, font: { family: palette.mono, size: 11 } },
          }),
          y: axis(palette, "Runs", { beginAtZero: true, ticks: { precision: 0, color: palette.muted, font: { family: palette.mono, size: 11 } } }),
        },
      },
    },
    summary: `Histogram of timings. ${series.map(describe).join(". ")}.`,
    notes: [],
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

/** A timing beyond this many medians counts as an outlier that zoom may put off the axis. */
const OUTLIER_FACTOR = 2;
/** A first run this many times the median is called out as a likely cold start. */
const COLD_START_FACTOR = 2;

/** Timings in the order they ran, so a slow first run or a drift is visible. */
export function runOrderChart(
  series: TimingSeries[],
  options: { zoom: boolean },
  palette: ChartPalette,
): ChartModel<"line"> & { canZoom: boolean } {
  const timed = series.filter((s) => s.times.length > 0);
  if (timed.length === 0) return { ...emptyModel("line", "No timings to draw."), canZoom: false };

  const all = timed.flatMap((s) => s.times);
  const unit = pickUnit(Math.max(...all));
  const value = (t: number) => Number(formatInUnit(t, unit));
  const limits = timed.map((s) => median(s.times) * OUTLIER_FACTOR);
  const outliers = timed.reduce((n, s, i) => n + s.times.filter((t) => t > limits[i]).length, 0);
  const canZoom = outliers > 0 && all.length > 2;
  const zoom = options.zoom && canZoom;

  const datasets: ChartDataset<"line", { x: number; y: number }[]>[] = timed.flatMap((s) => {
    const color = toneColor(s.tone, palette);
    const mid = value(median(s.times));
    const name = timed.length > 1 ? s.label : "Timing";
    return [
      {
        label: name,
        data: s.times.map((t, i) => ({ x: i + 1, y: value(t) })),
        borderColor: color,
        backgroundColor: color,
        showLine: false,
        pointRadius: 3,
        // Runs 1 and n sit on the plot's edges; without this half of each point is cut off.
        clip: 6,
      },
      {
        label: `${name} median`,
        data: [
          { x: 1, y: mid },
          { x: s.times.length, y: mid },
        ],
        borderColor: color,
        borderDash: [4, 3],
        borderWidth: 1,
        pointRadius: 0,
      },
    ];
  });

  const notes: string[] = [];
  for (const s of timed) {
    const mid = median(s.times);
    if (s.times.length > 1 && mid > 0 && s.times[0] / mid >= COLD_START_FACTOR) {
      const who = timed.length > 1 ? `${s.label}: the` : "The";
      notes.push(`${who} first run took ${(s.times[0] / mid).toFixed(1)} times the median: likely a cold start.`);
    }
  }
  const bulkMax = Math.max(...timed.flatMap((s, i) => s.times.filter((t) => t <= limits[i])));
  if (zoom) {
    notes.push(`${outliers} slower ${outliers === 1 ? "run is" : "runs are"} above the zoomed axis.`);
  }

  const lastRun = Math.max(...timed.map((s) => s.times.length));
  return {
    empty: false,
    unit,
    canZoom,
    config: {
      type: "line",
      data: { datasets },
      options: {
        ...baseOptions(palette, timed.length > 1),
        scales: {
          x: axis(palette, "Run", { type: "linear", min: 1, max: lastRun, ticks: { precision: 0, color: palette.muted, font: { family: palette.mono, size: 11 } } }),
          y: axis(palette, `Time (${unit.unit})`, zoom ? { max: value(bulkMax * 1.1) } : {}),
        },
      },
    },
    summary: `Timings in run order. ${timed
      .map((s) => `${timed.length > 1 ? `${s.label}: ` : ""}${s.times.length} runs, median ${formatInUnit(median(s.times), unit)} ${unit.unit}, from ${range(s.times, unit)}`)
      .join(". ")}.`,
    notes,
    table: {
      columns: ["Run", ...timed.map((s) => `${s.label} (${unit.unit})`)],
      rows: Array.from({ length: lastRun }, (_, i) => [
        String(i + 1),
        ...timed.map((s) => (i < s.times.length ? formatInUnit(s.times[i], unit) : "")),
      ]),
    },
  };
}

export interface TrendInput {
  /** Oldest first. */
  points: TrendPoint[];
  baselineRunId: string | null;
  budgetPercent: number | null;
}

/** Mean per run over time, with the 95% band where the spread is known and the budget line. */
export function trendChart(input: TrendInput, palette: ChartPalette): ChartModel<"line"> & { runIds: string[] } {
  const { points, baselineRunId, budgetPercent } = input;
  if (points.length === 0) return { ...emptyModel("line", "No runs to draw."), runIds: [] };

  const baseline = points.find((p) => p.runId === baselineRunId);
  const budget = baseline && budgetPercent !== null ? budgetThreshold(baseline.mean, budgetPercent) : null;
  const unit = pickUnit(Math.max(...points.map((p) => p.high ?? p.mean), budget ?? 0));
  const value = (t: number) => Number(formatInUnit(t, unit));
  const orNull = (t: number | null) => (t === null ? null : value(t));
  const isBaseline = (p: TrendPoint) => p.runId === baselineRunId;

  const band = { borderWidth: 0, pointRadius: 0, spanGaps: false, backgroundColor: withAlpha(palette.muted, 0.16) };
  const datasets: ChartDataset<"line", (number | null)[]>[] = [
    { label: "95% low", data: points.map((p) => orNull(p.low)), ...band, fill: false },
    { label: "95% interval", data: points.map((p) => orNull(p.high)), ...band, fill: "-1" },
    {
      label: "Mean",
      data: points.map((p) => value(p.mean)),
      borderColor: palette.muted,
      borderWidth: 1.5,
      pointRadius: points.map((p) => (isBaseline(p) ? 5 : 3.5)),
      pointBackgroundColor: points.map((p) => (isBaseline(p) ? palette.accent : p.dirty ? palette.background : palette.muted)),
      pointBorderColor: points.map((p) => (isBaseline(p) ? palette.accent : palette.muted)),
      pointBorderWidth: 1.5,
    },
  ];
  if (budget !== null) {
    datasets.push({
      label: `Budget (+${budgetPercent}%)`,
      data: points.map(() => value(budget)),
      borderColor: palette.warn,
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
    });
  }

  const notes = ["The time axis does not start at 0.", "Failed runs are left out. Hollow points had uncommitted changes."];
  if (budgetPercent !== null && !baseline) {
    notes.push("The pinned baseline has no result for this case, so the budget line is not drawn.");
  }

  const first = points[0];
  const newest = points[points.length - 1];
  return {
    empty: false,
    unit,
    runIds: points.map((p) => p.runId),
    config: {
      type: "line",
      data: { labels: points.map((p) => p.label), datasets },
      options: {
        ...baseOptions(palette, true),
        scales: {
          // Commit labels are long ("main @ 9e3779b"), so fewer fit than bin edges.
          x: axis(palette, "Run", { ticks: { ...UNCROWDED_TICKS, maxTicksLimit: 5, color: palette.muted, font: { family: palette.mono, size: 11 } } }),
          y: axis(palette, `Mean (${unit.unit})`, { beginAtZero: false }),
        },
        plugins: {
          ...baseOptions(palette, true).plugins,
          legend: {
            display: true,
            labels: {
              color: palette.ink,
              font: { family: palette.font, size: 12 },
              boxWidth: 12,
              filter: (item: { text: string }) => item.text !== "95% low",
            },
          },
        },
      },
    },
    summary:
      `Mean over ${points.length} runs, from ${first.label} to ${newest.label}: ` +
      `${formatInUnit(first.mean, unit)} ${unit.unit} to ${formatInUnit(newest.mean, unit)} ${unit.unit}.` +
      (budget === null ? "" : ` Budget line at ${formatInUnit(budget, unit)} ${unit.unit}.`),
    notes,
    table: {
      columns: ["Run", "Date", `Mean (${unit.unit})`, `95% low (${unit.unit})`, `95% high (${unit.unit})`, "Note"],
      rows: points.map((p) => [
        p.label,
        p.startedAt.slice(0, 10),
        formatInUnit(p.mean, unit),
        p.low === null ? "unknown" : formatInUnit(p.low, unit),
        p.high === null ? "unknown" : formatInUnit(p.high, unit),
        [isBaseline(p) ? "baseline" : "", p.dirty ? "uncommitted changes" : ""].filter(Boolean).join(", "),
      ]),
    },
  };
}
