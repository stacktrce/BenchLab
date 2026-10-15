import { describe, expect, it } from "vitest";
import { testPalette } from "./test-palette";
import { TrendPoint } from "./trend";
import { trendChart } from "./trend-chart";

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
    expect(trendChart(input([]), testPalette).empty).toBe(true);
  });

  it("plots the mean of each run, oldest first, in one unit", () => {
    const chart = trendChart(input(steady), testPalette);
    expect(chart.config.data.labels).toEqual(steady.map((p) => p.label));
    expect(dataset(chart, "Mean")?.data).toEqual([50, 52, 49, 55]);
  });

  it("leaves gaps in the band where the spread is unknown, and never invents one", () => {
    const chart = trendChart(input([point(1, 0.05), point(2, 0.05, null), point(3, 0.05)]), testPalette);
    expect(dataset(chart, "95% low")?.data).toEqual([48, null, 48]);
    expect(dataset(chart, "95% interval")?.data).toEqual([52, null, 52]);
  });

  it("marks uncommitted runs as hollow and the pinned baseline in the accent", () => {
    const chart = trendChart(input([point(1, 0.05), point(2, 0.051, 0.002, true)], "r1"), testPalette);
    const mean = dataset(chart, "Mean") as { pointBackgroundColor: string[]; pointRadius: number[] };
    expect(mean.pointBackgroundColor).toEqual([testPalette.accent, testPalette.background]);
    expect(mean.pointRadius[0]).toBeGreaterThan(mean.pointRadius[1]);
  });

  it("draws the budget line at the baseline mean plus the percentage", () => {
    const chart = trendChart(input(steady, "r1", 10), testPalette);
    expect(dataset(chart, "Budget (+10%)")?.data).toEqual([55, 55, 55, 55]);
    expect(chart.notes.join(" ")).not.toContain("budget line is not drawn");
  });

  it("explains a missing budget line when the baseline is not in the series", () => {
    const chart = trendChart(input(steady, "gone", 10), testPalette);
    expect(chart.config.data.datasets.some((d) => d.label?.startsWith("Budget"))).toBe(false);
    expect(chart.notes.join(" ")).toContain("budget line is not drawn");
  });

  it("does not start the time axis at zero, and says so", () => {
    const chart = trendChart(input(steady), testPalette);
    expect((chart.config.options?.scales?.["y"] as { beginAtZero?: boolean }).beginAtZero).toBe(false);
    expect(chart.notes.join(" ")).toContain("does not start at 0");
  });

  it("describes the data in words and as a table that links each run", () => {
    const chart = trendChart(input(steady, "r1", 10), testPalette);
    expect(chart.summary).toContain("4 runs");
    expect(chart.table.columns).toEqual(["Run", "Date", "Mean (ms)", "95% low (ms)", "95% high (ms)", "Note"]);
    expect(chart.runIds).toEqual(["r1", "r2", "r3", "r4"]);
    expect(chart.table.rows[0][5]).toContain("baseline");
  });
});
