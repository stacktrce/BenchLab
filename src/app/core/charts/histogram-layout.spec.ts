import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE, plotArea } from "./layout";
import { layoutHistogram } from "./histogram-layout";

const ramp = (n: number, from: number, step: number) => Array.from({ length: n }, (_, i) => from + i * step);
const area = plotArea(DEFAULT_SIZE);

describe("layoutHistogram", () => {
  const baseline = ramp(20, 0.040, 0.0002);
  const candidate = ramp(20, 0.048, 0.0002);

  it("is empty, with an explanation, when there is nothing to draw", () => {
    const layout = layoutHistogram([{ label: "x", times: [], tone: "plain" }]);
    expect(layout.empty).toBe(true);
    expect(layout.bars).toEqual([]);
    expect(layout.summary).toContain("No timings");
  });

  it("draws every bar inside the plot area and never a negative size", () => {
    const layout = layoutHistogram([{ label: "x", times: baseline, tone: "plain" }]);
    expect(layout.bars.length).toBeGreaterThan(0);
    for (const b of layout.bars) {
      expect(b.x).toBeGreaterThanOrEqual(area.left - 0.01);
      expect(b.x + b.width).toBeLessThanOrEqual(area.right + 0.01);
      expect(b.y).toBeGreaterThanOrEqual(area.top - 0.01);
      expect(b.y + b.height).toBeLessThanOrEqual(area.bottom + 0.01);
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
    }
  });

  it("makes bar heights proportional to counts", () => {
    const layout = layoutHistogram([{ label: "x", times: baseline, tone: "plain" }]);
    const [a, b] = [layout.bars[0], layout.bars[1]];
    expect(a.height / b.height).toBeCloseTo(a.count / b.count, 6);
  });

  it("counts every timing exactly once across the bars of a series", () => {
    const layout = layoutHistogram([{ label: "x", times: baseline, tone: "plain" }]);
    expect(layout.bars.reduce((n, b) => n + b.count, 0)).toBe(baseline.length);
  });

  it("uses one axis for two series so they can be compared by eye", () => {
    const layout = layoutHistogram([
      { label: "Baseline", times: baseline, tone: "base" },
      { label: "Candidate", times: candidate, tone: "cand" },
    ]);
    expect(new Set(layout.bars.map((b) => b.series))).toEqual(new Set([0, 1]));
    const base = layout.bars.filter((b) => b.series === 0);
    const cand = layout.bars.filter((b) => b.series === 1);
    expect(Math.max(...base.map((b) => b.x))).toBeLessThan(Math.max(...cand.map((b) => b.x)));
    expect(layout.means).toHaveLength(2);
    expect(layout.means[0].x).toBeLessThan(layout.means[1].x);
  });

  it("labels the axis in one unit chosen from the largest value", () => {
    const ms = layoutHistogram([{ label: "x", times: baseline, tone: "plain" }]);
    expect(ms.unit.unit).toBe("ms");
    const seconds = layoutHistogram([{ label: "x", times: [1.2, 1.4, 2.1, 2.2], tone: "plain" }]);
    expect(seconds.unit.unit).toBe("s");
    expect(ms.xTicks.every((t) => /^\d+(\.\d+)?$/.test(t.label))).toBe(true);
  });

  it("puts ticks inside the plot and only whole numbers on the count axis", () => {
    const layout = layoutHistogram([{ label: "x", times: baseline, tone: "plain" }]);
    for (const t of layout.xTicks) {
      expect(t.pos).toBeGreaterThanOrEqual(area.left - 0.01);
      expect(t.pos).toBeLessThanOrEqual(area.right + 0.01);
    }
    expect(layout.yTicks.length).toBeGreaterThan(0);
    expect(layout.yTicks.every((t) => Number.isInteger(Number(t.label)))).toBe(true);
  });

  it("draws identical timings as one visible, centred bar instead of a zero-width one", () => {
    const layout = layoutHistogram([{ label: "x", times: [0.02, 0.02, 0.02], tone: "plain" }]);
    expect(layout.bars).toHaveLength(1);
    expect(layout.bars[0].width).toBeGreaterThan(4);
    expect(layout.bars[0].count).toBe(3);
    const centre = layout.bars[0].x + layout.bars[0].width / 2;
    expect(centre).toBeCloseTo((area.left + area.right) / 2, 0);
  });

  it("draws a single timing without failing", () => {
    const layout = layoutHistogram([{ label: "x", times: [0.02], tone: "plain" }]);
    expect(layout.bars).toHaveLength(1);
    expect(layout.empty).toBe(false);
  });

  it("describes the data in words and as a table with one count column per series", () => {
    const layout = layoutHistogram([
      { label: "Baseline", times: baseline, tone: "base" },
      { label: "Candidate", times: candidate, tone: "cand" },
    ]);
    expect(layout.summary).toContain("Baseline");
    expect(layout.summary).toContain("Candidate");
    expect(layout.summary).toContain("ms");
    expect(layout.table.columns).toEqual(["From (ms)", "To (ms)", "Baseline", "Candidate"]);
    const total = layout.table.rows.reduce((n, r) => n + Number(r[2]) + Number(r[3]), 0);
    expect(total).toBe(40);
  });
});
