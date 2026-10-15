import { describe, expect, it } from "vitest";
import { runOrderChart } from "./run-order-chart";
import { testPalette } from "./test-palette";

describe("runOrderChart", () => {
  const steady = [0.05, 0.051, 0.049, 0.05, 0.052, 0.048];

  it("is empty without timings", () => {
    expect(runOrderChart([{ label: "x", times: [], tone: "plain" }], { zoom: false }, testPalette).empty).toBe(true);
  });

  it("plots each run at its position in the order it ran", () => {
    const chart = runOrderChart([{ label: "x", times: [0.1, 0.05], tone: "plain" }], { zoom: false }, testPalette);
    expect(chart.config.data.datasets[0].data).toEqual([
      { x: 1, y: 100 },
      { x: 2, y: 50 },
    ]);
  });

  it("adds a dashed median line per series", () => {
    const chart = runOrderChart([{ label: "x", times: [0.01, 0.02, 0.09], tone: "plain" }], { zoom: false }, testPalette);
    const median = chart.config.data.datasets[1];
    expect(median.label).toContain("median");
    expect(median.data).toEqual([
      { x: 1, y: 20 },
      { x: 3, y: 20 },
    ]);
  });

  it("reports a cold first run against the median", () => {
    const chart = runOrderChart([{ label: "x", times: [0.2, 0.05, 0.05, 0.05], tone: "plain" }], { zoom: false }, testPalette);
    expect(chart.notes.join(" ")).toContain("4.0 times the median");
  });

  it("offers zoom only when an outlier squashes the rest", () => {
    expect(runOrderChart([{ label: "x", times: steady, tone: "plain" }], { zoom: false }, testPalette).canZoom).toBe(false);
    expect(runOrderChart([{ label: "x", times: [1, 0.05, 0.05, 0.05, 0.05], tone: "plain" }], { zoom: false }, testPalette).canZoom).toBe(
      true,
    );
  });

  it("zoom caps the axis below the outlier and says how many runs are off it", () => {
    const times = [1, 0.05, 0.051, 0.049, 0.05];
    const full = runOrderChart([{ label: "x", times, tone: "plain" }], { zoom: false }, testPalette);
    const zoomed = runOrderChart([{ label: "x", times, tone: "plain" }], { zoom: true }, testPalette);
    const yMax = (c: typeof full) => (c.config.options?.scales?.["y"] as { max?: number }).max;
    expect(yMax(full)).toBeUndefined();
    // The unit stays seconds (from the outlier) so toggling zoom does not relabel the axis.
    expect(zoomed.unit.unit).toBe("s");
    expect(yMax(zoomed)).toBeLessThan(1);
    expect(yMax(zoomed)).toBeGreaterThan(0.051);
    expect(zoomed.notes.join(" ")).toContain("1 slower run is above the zoomed axis");
  });

  it("describes the data in words and as a table", () => {
    const chart = runOrderChart([{ label: "x", times: [0.2, 0.05, 0.05], tone: "plain" }], { zoom: false }, testPalette);
    expect(chart.summary).toContain("3 runs");
    expect(chart.table.columns).toEqual(["Run", "x (ms)"]);
    expect(chart.table.rows[0]).toEqual(["1", "200"]);
  });
});
