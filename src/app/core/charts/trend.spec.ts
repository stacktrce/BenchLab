import { describe, expect, it } from "vitest";
import { CasePoint } from "../models";
import { budgetThreshold, thin, trendPoints } from "./trend";

const point = (over: Partial<CasePoint> = {}): CasePoint => ({
  runId: "r", startedAt: "2026-10-13T11:30:00.000Z", status: "completed", commit: null, shortCommit: null,
  branch: null, dirty: false, mean: 0.01, stddev: 0.001, median: 0.01, min: 0.009, max: 0.011, samples: 10, ...over,
});

describe("trendPoints", () => {
  it("builds a symmetric 95% band of mean plus or minus 1.96 standard errors", () => {
    const [p] = trendPoints([point({ mean: 0.01, stddev: 0.002, samples: 16 })]);
    const half = (1.96 * 0.002) / Math.sqrt(16);
    expect(p.low).toBeCloseTo(0.01 - half, 12);
    expect(p.high).toBeCloseTo(0.01 + half, 12);
  });

  it("has no band for a single sample, because there is no spread to speak of", () => {
    const [p] = trendPoints([point({ samples: 1, stddev: 0.002 })]);
    expect([p.low, p.high]).toEqual([null, null]);
  });

  it("has no band when the standard deviation is unknown, and never invents one", () => {
    const [p] = trendPoints([point({ stddev: null })]);
    expect([p.low, p.high]).toEqual([null, null]);
  });

  it("labels a point with branch and short commit, or with the date when there is no commit", () => {
    const [withGit, without] = trendPoints([
      point({ branch: "perf/join", shortCommit: "c71ab3e" }),
      point({ startedAt: "2026-10-12T09:00:00.000Z" }),
    ]);
    expect(withGit.label).toBe("perf/join @ c71ab3e");
    expect(without.label).toBe("2026-10-12");
  });

  it("labels a detached commit with just the commit", () => {
    expect(trendPoints([point({ branch: null, shortCommit: "9f2c1d4" })])[0].label).toBe("detached @ 9f2c1d4");
  });

  it("keeps the run id, the time and the dirty flag", () => {
    const [p] = trendPoints([point({ runId: "abc", dirty: true })]);
    expect(p).toMatchObject({ runId: "abc", dirty: true, startedAt: "2026-10-13T11:30:00.000Z" });
  });

  it("keeps the order it was given", () => {
    const ps = trendPoints([point({ runId: "a" }), point({ runId: "b" }), point({ runId: "c" })]);
    expect(ps.map((p) => p.runId)).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for no points", () => {
    expect(trendPoints([])).toEqual([]);
  });
});

describe("budgetThreshold", () => {
  it("is the baseline mean raised by the budget percentage", () => {
    expect(budgetThreshold(10, 5)).toBeCloseTo(10.5, 12);
    expect(budgetThreshold(0.02, 10)).toBeCloseTo(0.022, 12);
  });
});

describe("thin", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("returns the input unchanged when it already fits", () => {
    expect(thin(items(10), 500)).toEqual({ points: items(10), thinned: false });
    expect(thin(items(500), 500).thinned).toBe(false);
  });

  it("keeps at most the limit, always the first and the newest point, and says so", () => {
    const result = thin(items(1000), 500);
    expect(result.thinned).toBe(true);
    expect(result.points.length).toBeLessThanOrEqual(500);
    expect(result.points[0]).toBe(0);
    expect(result.points[result.points.length - 1]).toBe(999);
  });

  it("stays in order and has no duplicates", () => {
    const { points } = thin(items(777), 100);
    expect(points).toEqual([...points].sort((a, b) => a - b));
    expect(new Set(points).size).toBe(points.length);
  });

  it("copes with a limit of 2 and with an empty list", () => {
    expect(thin(items(50), 2).points).toEqual([0, 49]);
    expect(thin([], 5)).toEqual({ points: [], thinned: false });
  });
});
