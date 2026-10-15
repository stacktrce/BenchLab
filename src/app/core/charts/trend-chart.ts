import type { ChartDataset } from "chart.js";
import { axis, baseOptions, ChartModel, emptyModel, UNCROWDED_TICKS } from "./chart-model";
import { ChartPalette, withAlpha } from "./palette";
import { formatInUnit, pickUnit } from "./scale";
import { budgetThreshold, TrendPoint } from "./trend";

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
