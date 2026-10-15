import type { ChartDataset } from "chart.js";
import { axis, baseOptions, ChartModel, emptyModel, range, TimingSeries, UNCROWDED_TICKS } from "./chart-model";
import { sharedHistograms } from "./histogram";
import { median } from "./numbers";
import { ChartPalette, toneColor, withAlpha } from "./palette";
import { formatInUnit, pickUnit, TimeUnit } from "./scale";

/** A bin edge with only as many decimals as the bin width needs, so labels stay short. */
export function binLabel(seconds: number, widthSeconds: number, unit: TimeUnit): string {
  const width = widthSeconds * unit.factor;
  const decimals = width > 0 ? Math.min(3, Math.max(0, 1 - Math.floor(Math.log10(width)))) : 3;
  return (seconds * unit.factor).toFixed(decimals);
}

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
