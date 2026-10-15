import type { ChartDataset } from "chart.js";
import { axis, baseOptions, ChartModel, emptyModel, range, TimingSeries } from "./chart-model";
import { median } from "./numbers";
import { ChartPalette, toneColor } from "./palette";
import { formatInUnit, pickUnit } from "./scale";

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
