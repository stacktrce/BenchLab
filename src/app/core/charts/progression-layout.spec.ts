import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE, plotArea } from "./layout";
import { layoutProgression } from "./progression-layout";

const area = plotArea(DEFAULT_SIZE);
const steady = [0.05, 0.051, 0.049, 0.05, 0.052, 0.048];

describe("layoutProgression", () => {
  it("is empty, with an explanation, without timings", () => {
    const layout = layoutProgression([], { zoom: false });
    expect(layout.empty).toBe(true);
    expect(layout.summary).toContain("No timings");
  });

  it("draws one point per run, in run order, inside the plot area", () => {
    const layout = layoutProgression(steady, { zoom: false });
    expect(layout.points).toHaveLength(steady.length);
    for (let i = 1; i < layout.points.length; i++) {
      expect(layout.points[i].x).toBeGreaterThan(layout.points[i - 1].x);
    }
    for (const p of layout.points) {
      expect(p.x).toBeGreaterThanOrEqual(area.left - 0.01);
      expect(p.x).toBeLessThanOrEqual(area.right + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(area.top - 0.01);
      expect(p.y).toBeLessThanOrEqual(area.bottom + 0.01);
    }
  });

  it("draws a longer timing higher on the chart", () => {
    const layout = layoutProgression([0.1, 0.05], { zoom: false });
    expect(layout.points[0].y).toBeLessThan(layout.points[1].y);
  });

  it("places the median line between the extremes", () => {
    const layout = layoutProgression([0.01, 0.02, 0.09], { zoom: false });
    const ys = layout.points.map((p) => p.y);
    expect(layout.medianY).toBeLessThan(Math.max(...ys));
    expect(layout.medianY).toBeGreaterThan(Math.min(...ys));
  });

  it("centres a single run instead of dividing by zero", () => {
    const layout = layoutProgression([0.02], { zoom: false });
    expect(layout.points).toHaveLength(1);
    expect(Number.isFinite(layout.points[0].x)).toBe(true);
    expect(Number.isFinite(layout.points[0].y)).toBe(true);
  });

  it("copes with identical timings", () => {
    const layout = layoutProgression([0.02, 0.02, 0.02], { zoom: false });
    expect(layout.points.every((p) => Number.isFinite(p.y))).toBe(true);
  });

  it("reports how much slower the first run was than the median", () => {
    const layout = layoutProgression([0.2, 0.05, 0.05, 0.05], { zoom: false });
    expect(layout.firstRunRatio).toBeCloseTo(4, 6);
    expect(layoutProgression([0.05], { zoom: false }).firstRunRatio).toBeNull();
  });

  it("offers zoom only when an outlier squashes the rest", () => {
    expect(layoutProgression(steady, { zoom: false }).canZoom).toBe(false);
    expect(layoutProgression([1, 0.05, 0.05, 0.05, 0.05], { zoom: false }).canZoom).toBe(true);
  });

  it("zoom lifts the bulk of the runs and marks the clipped ones at the top", () => {
    const times = [1, 0.05, 0.051, 0.049, 0.05];
    const full = layoutProgression(times, { zoom: false });
    const zoomed = layoutProgression(times, { zoom: true });
    const spread = (l: typeof full) => Math.max(...l.points.slice(1).map((p) => p.y)) - Math.min(...l.points.slice(1).map((p) => p.y));
    expect(spread(zoomed)).toBeGreaterThan(spread(full) * 3);
    expect(zoomed.points[0].clipped).toBe(true);
    expect(zoomed.points[0].y).toBeCloseTo(area.top, 6);
    expect(full.points.every((p) => !p.clipped)).toBe(true);
  });

  it("ignores zoom when nothing needs zooming", () => {
    expect(layoutProgression(steady, { zoom: true }).points).toEqual(layoutProgression(steady, { zoom: false }).points);
  });

  it("describes the data in words and as a table", () => {
    const layout = layoutProgression([0.2, 0.05, 0.05], { zoom: false });
    expect(layout.summary).toContain("3 runs");
    expect(layout.summary).toContain("ms");
    expect(layout.table.columns).toEqual(["Run", "Time (ms)"]);
    expect(layout.table.rows).toHaveLength(3);
    expect(layout.table.rows[0]).toEqual(["1", "200"]);
  });
});
