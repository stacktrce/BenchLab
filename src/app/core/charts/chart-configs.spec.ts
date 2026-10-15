import { describe, expect, it } from "vitest";
import { binLabel, histogramChart, runOrderChart, trendChart } from "./chart-configs";
import { ChartPalette } from "./palette";
import { TrendPoint } from "./trend";

const palette: ChartPalette = {
  ink: "#111111",
  muted: "#555555",
  grid: "#dddddd",
  accent: "#c2410c",
  warn: "#9a5b00",
  background: "#fbfaf7",
  font: "IBM Plex Sans",
  mono: "IBM Plex Mono",
};

const ramp = (n: number, from: number, step: number) => Array.from({ length: n }, (_, i) => from + i * step);

describe("histogramChart", () => {
  const baseline = ramp(20, 0.04, 0.0002);
  const candidate = ramp(20, 0.048, 0.0002);

  it("is empty, with an explanation, when there is nothing to draw", () => {
    const chart = histogramChart([{ label: "x", times: [], tone: "plain" }], palette);
    expect(chart.empty).toBe(true);
    expect(chart.summary).toContain("No timings");
  });

  it("puts every timing in exactly one bin", () => {
    const chart = histogramChart([{ label: "x", times: baseline, tone: "plain" }], palette);
    const counts = chart.config.data.datasets[0].data as number[];
    expect(counts.reduce((a, b) => a + b, 0)).toBe(baseline.length);
  });

  it("bins two series on the same edges, baseline quiet and candidate in the accent", () => {
    const chart = histogramChart(
      [
        { label: "Baseline", times: baseline, tone: "base" },
        { label: "Candidate", times: candidate, tone: "cand" },
      ],
      palette,
    );
    const [base, cand] = chart.config.data.datasets;
    expect(base.data).toHaveLength(cand.data.length);
    expect(base.backgroundColor).toContain(palette.muted.slice(1));
    expect(cand.backgroundColor).toContain(palette.accent.slice(1));
  });

  it("labels bins in one unit chosen from the largest value", () => {
    const chart = histogramChart([{ label: "x", times: baseline, tone: "plain" }], palette);
    expect(chart.unit.unit).toBe("ms");
    expect((chart.config.data.labels as string[]).every((l) => /^\d+(\.\d+)?$/.test(l))).toBe(true);
    expect((chart.config.data.labels as string[]).every((l) => l.length <= 5)).toBe(true);
  });

  it("draws identical timings as a single bin", () => {
    const chart = histogramChart([{ label: "x", times: [0.02, 0.02, 0.02], tone: "plain" }], palette);
    expect(chart.config.data.datasets[0].data).toEqual([3]);
  });

  it("describes the data in words and as a table with one count column per series", () => {
    const chart = histogramChart(
      [
        { label: "Baseline", times: baseline, tone: "base" },
        { label: "Candidate", times: candidate, tone: "cand" },
      ],
      palette,
    );
    expect(chart.summary).toContain("Baseline");
    expect(chart.summary).toContain("ms");
    expect(chart.table.columns).toEqual(["From (ms)", "To (ms)", "Baseline", "Candidate"]);
    expect(chart.table.rows.reduce((n, r) => n + Number(r[2]) + Number(r[3]), 0)).toBe(40);
  });

  it("does not animate, so the chart is calm and screenshots are stable", () => {
    expect(histogramChart([{ label: "x", times: baseline, tone: "plain" }], palette).config.options?.animation).toBe(false);
  });
});

describe("binLabel", () => {
  const ms = { unit: "ms" as const, factor: 1000 };

  it("keeps one significant decimal of the bin width", () => {
    expect(binLabel(0.051752, 0.004014, ms)).toBe("51.8");
    expect(binLabel(0.051752, 0.0004, ms)).toBe("51.75");
    expect(binLabel(0.051752, 0.04, ms)).toBe("52");
  });

  it("falls back to three decimals for a bin of no width", () => {
    expect(binLabel(0.02, 0, ms)).toBe("20.000");
  });
});

describe("runOrderChart", () => {
  const steady = [0.05, 0.051, 0.049, 0.05, 0.052, 0.048];

  it("is empty without timings", () => {
    expect(runOrderChart([{ label: "x", times: [], tone: "plain" }], { zoom: false }, palette).empty).toBe(true);
  });

  it("plots each run at its position in the order it ran", () => {
    const chart = runOrderChart([{ label: "x", times: [0.1, 0.05], tone: "plain" }], { zoom: false }, palette);
    expect(chart.config.data.datasets[0].data).toEqual([
      { x: 1, y: 100 },
      { x: 2, y: 50 },
    ]);
  });

  it("adds a dashed median line per series", () => {
    const chart = runOrderChart([{ label: "x", times: [0.01, 0.02, 0.09], tone: "plain" }], { zoom: false }, palette);
    const median = chart.config.data.datasets[1];
    expect(median.label).toContain("median");
    expect(median.data).toEqual([
      { x: 1, y: 20 },
      { x: 3, y: 20 },
    ]);
  });

  it("reports a cold first run against the median", () => {
    const chart = runOrderChart([{ label: "x", times: [0.2, 0.05, 0.05, 0.05], tone: "plain" }], { zoom: false }, palette);
    expect(chart.notes.join(" ")).toContain("4.0 times the median");
  });

  it("offers zoom only when an outlier squashes the rest", () => {
    expect(runOrderChart([{ label: "x", times: steady, tone: "plain" }], { zoom: false }, palette).canZoom).toBe(false);
    expect(runOrderChart([{ label: "x", times: [1, 0.05, 0.05, 0.05, 0.05], tone: "plain" }], { zoom: false }, palette).canZoom).toBe(
      true,
    );
  });

  it("zoom caps the axis below the outlier and says how many runs are off it", () => {
    const times = [1, 0.05, 0.051, 0.049, 0.05];
    const full = runOrderChart([{ label: "x", times, tone: "plain" }], { zoom: false }, palette);
    const zoomed = runOrderChart([{ label: "x", times, tone: "plain" }], { zoom: true }, palette);
    const yMax = (c: typeof full) => (c.config.options?.scales?.["y"] as { max?: number }).max;
    expect(yMax(full)).toBeUndefined();
    // The unit stays seconds (from the outlier) so toggling zoom does not relabel the axis.
    expect(zoomed.unit.unit).toBe("s");
    expect(yMax(zoomed)).toBeLessThan(1);
    expect(yMax(zoomed)).toBeGreaterThan(0.051);
    expect(zoomed.notes.join(" ")).toContain("1 slower run is above the zoomed axis");
  });

  it("describes the data in words and as a table", () => {
    const chart = runOrderChart([{ label: "x", times: [0.2, 0.05, 0.05], tone: "plain" }], { zoom: false }, palette);
    expect(chart.summary).toContain("3 runs");
    expect(chart.table.columns).toEqual(["Run", "x (ms)"]);
    expect(chart.table.rows[0]).toEqual(["1", "200"]);
  });
});

const point = (n: number, mean: number, spread: number | null = 0.002, dirty = false): TrendPoint => ({
  runId: `r${n}`,
  startedAt: `2026-10-${String(n).padStart(2, "0")}T10:00:00Z`,
  mean,
  low: spread === null ? null : mean - spread,
  high: spread === null ? null : mean + spread,
  dirty,
  label: `main @ c${n}`,
});

describe("trendChart", () => {
  const steady = [point(1, 0.05), point(2, 0.052), point(3, 0.049), point(4, 0.055)];
  const input = (points: TrendPoint[], baselineRunId: string | null = null, budgetPercent: number | null = null) => ({
    points,
    baselineRunId,
    budgetPercent,
  });
  const dataset = (chart: ReturnType<typeof trendChart>, label: string) =>
    chart.config.data.datasets.find((d) => d.label === label);

  it("is empty without runs", () => {
    expect(trendChart(input([]), palette).empty).toBe(true);
  });

  it("plots the mean of each run, oldest first, in one unit", () => {
    const chart = trendChart(input(steady), palette);
    expect(chart.config.data.labels).toEqual(steady.map((p) => p.label));
    expect(dataset(chart, "Mean")?.data).toEqual([50, 52, 49, 55]);
  });

  it("leaves gaps in the band where the spread is unknown, and never invents one", () => {
    const chart = trendChart(input([point(1, 0.05), point(2, 0.05, null), point(3, 0.05)]), palette);
    expect(dataset(chart, "95% low")?.data).toEqual([48, null, 48]);
    expect(dataset(chart, "95% interval")?.data).toEqual([52, null, 52]);
  });

  it("marks uncommitted runs as hollow and the pinned baseline in the accent", () => {
    const chart = trendChart(input([point(1, 0.05), point(2, 0.051, 0.002, true)], "r1"), palette);
    const mean = dataset(chart, "Mean") as { pointBackgroundColor: string[]; pointRadius: number[] };
    expect(mean.pointBackgroundColor).toEqual([palette.accent, palette.background]);
    expect(mean.pointRadius[0]).toBeGreaterThan(mean.pointRadius[1]);
  });

  it("draws the budget line at the baseline mean plus the percentage", () => {
    const chart = trendChart(input(steady, "r1", 10), palette);
    expect(dataset(chart, "Budget (+10%)")?.data).toEqual([55, 55, 55, 55]);
    expect(chart.notes.join(" ")).not.toContain("budget line is not drawn");
  });

  it("explains a missing budget line when the baseline is not in the series", () => {
    const chart = trendChart(input(steady, "gone", 10), palette);
    expect(chart.config.data.datasets.some((d) => d.label?.startsWith("Budget"))).toBe(false);
    expect(chart.notes.join(" ")).toContain("budget line is not drawn");
  });

  it("does not start the time axis at zero, and says so", () => {
    const chart = trendChart(input(steady), palette);
    expect((chart.config.options?.scales?.["y"] as { beginAtZero?: boolean }).beginAtZero).toBe(false);
    expect(chart.notes.join(" ")).toContain("does not start at 0");
  });

  it("describes the data in words and as a table that links each run", () => {
    const chart = trendChart(input(steady, "r1", 10), palette);
    expect(chart.summary).toContain("4 runs");
    expect(chart.table.columns).toEqual(["Run", "Date", "Mean (ms)", "95% low (ms)", "95% high (ms)", "Note"]);
    expect(chart.runIds).toEqual(["r1", "r2", "r3", "r4"]);
    expect(chart.table.rows[0][5]).toContain("baseline");
  });
});
