import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE, plotArea } from "./layout";
import { TrendPoint } from "./trend";
import { layoutTrend } from "./trend-layout";

const area = plotArea(DEFAULT_SIZE);

const point = (n: number, mean: number, spread: number | null = 0.002, dirty = false): TrendPoint => ({
  runId: `r${n}`,
  startedAt: `2026-10-${String(n).padStart(2, "0")}T10:00:00Z`,
  mean,
  low: spread === null ? null : mean - spread,
  high: spread === null ? null : mean + spread,
  dirty,
  label: `main @ c${n}`,
});

const input = (points: TrendPoint[], baselineRunId: string | null = null, budgetPercent: number | null = null) => ({
  points,
  baselineRunId,
  budgetPercent,
});

const steady = [point(1, 0.05), point(2, 0.052), point(3, 0.049), point(4, 0.055)];

describe("layoutTrend", () => {
  it("is empty, with an explanation, without runs", () => {
    const layout = layoutTrend(input([]));
    expect(layout.empty).toBe(true);
    expect(layout.summary).toContain("No runs");
  });

  it("keeps oldest on the left and every point inside the plot", () => {
    const layout = layoutTrend(input(steady));
    for (let i = 1; i < layout.points.length; i++) expect(layout.points[i].x).toBeGreaterThan(layout.points[i - 1].x);
    for (const p of layout.points) {
      expect(p.x).toBeGreaterThanOrEqual(area.left - 0.01);
      expect(p.x).toBeLessThanOrEqual(area.right + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(area.top - 0.01);
      expect(p.y).toBeLessThanOrEqual(area.bottom + 0.01);
    }
  });

  it("draws a larger mean higher on the chart", () => {
    const layout = layoutTrend(input(steady));
    expect(layout.points[3].y).toBeLessThan(layout.points[2].y);
  });

  it("draws a band only where the spread is known, and never invents one", () => {
    const layout = layoutTrend(input([point(1, 0.05, null), point(2, 0.051, null)]));
    expect(layout.bandPaths).toEqual([]);
    expect(layout.points.every((p) => p.yLow === null && p.yHigh === null)).toBe(true);
  });

  it("breaks the band into separate pieces at a run without spread", () => {
    const layout = layoutTrend(
      input([point(1, 0.05), point(2, 0.051), point(3, 0.05, null), point(4, 0.05), point(5, 0.052)]),
    );
    expect(layout.bandPaths).toHaveLength(2);
  });

  it("keeps a lone run with a known spread as a whisker", () => {
    const layout = layoutTrend(input([point(1, 0.05), point(2, 0.05, null)]));
    expect(layout.bandPaths).toEqual([]);
    expect(layout.points[0].yLow).toBeGreaterThan(layout.points[0].yHigh as number);
  });

  it("marks uncommitted runs and the pinned baseline", () => {
    const layout = layoutTrend(input([point(1, 0.05), point(2, 0.051, 0.002, true)], "r1"));
    expect(layout.points.map((p) => p.dirty)).toEqual([false, true]);
    expect(layout.points.map((p) => p.isBaseline)).toEqual([true, false]);
  });

  it("draws the budget line at the baseline mean plus the percentage", () => {
    const withBudget = layoutTrend(input(steady, "r1", 10));
    const without = layoutTrend(input(steady, "r1", null));
    expect(without.budgetY).toBeNull();
    expect(withBudget.budgetY).not.toBeNull();
    expect(withBudget.budgetY as number).toBeLessThan(withBudget.points[0].y);
    expect(withBudget.budgetY as number).toBeGreaterThanOrEqual(area.top - 0.01);
  });

  it("draws no budget line when the baseline is not among the runs", () => {
    expect(layoutTrend(input(steady, "gone", 10)).budgetY).toBeNull();
    expect(layoutTrend(input(steady, null, 10)).budgetY).toBeNull();
  });

  it("says when the axis does not start at zero", () => {
    expect(layoutTrend(input(steady)).axisNote).toContain("does not start at 0");
  });

  it("copes with one run and with identical means", () => {
    const one = layoutTrend(input([point(1, 0.05)]));
    expect(one.points).toHaveLength(1);
    expect(Number.isFinite(one.points[0].x)).toBe(true);
    const flat = layoutTrend(input([point(1, 0.05, null), point(2, 0.05, null)]));
    expect(flat.points.every((p) => Number.isFinite(p.y))).toBe(true);
  });

  it("describes the data in words and as a table", () => {
    const layout = layoutTrend(input(steady, "r1", 10));
    expect(layout.summary).toContain("4 runs");
    expect(layout.table.columns).toEqual(["Run", "Date", "Mean (ms)", "95% low (ms)", "95% high (ms)", "Note"]);
    expect(layout.table.rows).toHaveLength(4);
    expect(layout.table.rows[0][0]).toBe("main @ c1");
    expect(layout.table.rows[0][5]).toContain("baseline");
  });
});
