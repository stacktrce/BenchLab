import { describe, expect, it } from "vitest";
import { binLabel, histogramChart } from "./histogram-chart";
import { testPalette } from "./test-palette";

const ramp = (n: number, from: number, step: number) => Array.from({ length: n }, (_, i) => from + i * step);

describe("histogramChart", () => {
  const baseline = ramp(20, 0.04, 0.0002);
  const candidate = ramp(20, 0.048, 0.0002);

  it("is empty, with an explanation, when there is nothing to draw", () => {
    const chart = histogramChart([{ label: "x", times: [], tone: "plain" }], testPalette);
    expect(chart.empty).toBe(true);
    expect(chart.summary).toContain("No timings");
  });

  it("puts every timing in exactly one bin", () => {
    const chart = histogramChart([{ label: "x", times: baseline, tone: "plain" }], testPalette);
    const counts = chart.config.data.datasets[0].data as number[];
    expect(counts.reduce((a, b) => a + b, 0)).toBe(baseline.length);
  });

  it("bins two series on the same edges, baseline quiet and candidate in the accent", () => {
    const chart = histogramChart(
      [
        { label: "Baseline", times: baseline, tone: "base" },
        { label: "Candidate", times: candidate, tone: "cand" },
      ],
      testPalette,
    );
    const [base, cand] = chart.config.data.datasets;
    expect(base.data).toHaveLength(cand.data.length);
    expect(base.backgroundColor).toContain(testPalette.muted.slice(1));
    expect(cand.backgroundColor).toContain(testPalette.accent.slice(1));
  });

  it("labels bins in one unit chosen from the largest value", () => {
    const chart = histogramChart([{ label: "x", times: baseline, tone: "plain" }], testPalette);
    expect(chart.unit.unit).toBe("ms");
    expect((chart.config.data.labels as string[]).every((l) => /^\d+(\.\d+)?$/.test(l))).toBe(true);
    expect((chart.config.data.labels as string[]).every((l) => l.length <= 5)).toBe(true);
  });

  it("draws identical timings as a single bin", () => {
    const chart = histogramChart([{ label: "x", times: [0.02, 0.02, 0.02], tone: "plain" }], testPalette);
    expect(chart.config.data.datasets[0].data).toEqual([3]);
  });

  it("describes the data in words and as a table with one count column per series", () => {
    const chart = histogramChart(
      [
        { label: "Baseline", times: baseline, tone: "base" },
        { label: "Candidate", times: candidate, tone: "cand" },
      ],
      testPalette,
    );
    expect(chart.summary).toContain("Baseline");
    expect(chart.summary).toContain("ms");
    expect(chart.table.columns).toEqual(["From (ms)", "To (ms)", "Baseline", "Candidate"]);
    expect(chart.table.rows.reduce((n, r) => n + Number(r[2]) + Number(r[3]), 0)).toBe(40);
  });

  it("does not animate, so the chart is calm and screenshots are stable", () => {
    expect(histogramChart([{ label: "x", times: baseline, tone: "plain" }], testPalette).config.options?.animation).toBe(false);
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
