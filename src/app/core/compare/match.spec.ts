import { describe, expect, it } from "vitest";
import type { CaseResult } from "../parser/hyperfine.types";
import { compareRuns } from "./match";
import { result, run } from "./test-data";

describe("compareRuns", () => {
  it("computes absolute and relative delta as candidate vs baseline", () => {
    const [row] = compareRuns(run(result("a", 1.0)), run(result("a", 0.75)));
    expect(row.kind).toBe("matched");
    expect(row.deltaSeconds).toBeCloseTo(-0.25);
    expect(row.deltaPercent).toBeCloseTo(-25);
    expect(row.verdict).toBe("faster");
  });

  it("flags a regression", () => {
    const [row] = compareRuns(run(result("a", 1.0)), run(result("a", 1.5)));
    expect(row.deltaPercent).toBeCloseTo(50);
    expect(row.verdict).toBe("slower");
  });

  it("calls a difference within noise inconclusive", () => {
    const [row] = compareRuns(
      run(result("a", 1.0, { stddev: 0.5 })),
      run(result("a", 1.05, { stddev: 0.5 })),
    );
    expect(row.verdict).toBe("inconclusive");
  });

  it("matches strictly by name and labels unmatched cases on both sides", () => {
    const rows = compareRuns(
      run(result("a", 1), result("only-base", 1)),
      run(result("A", 1), result("a", 1), result("only-cand", 1)),
    );
    expect(rows.map((r) => [r.name, r.kind])).toEqual([
      ["a", "matched"],
      ["only-base", "baseline-only"],
      ["A", "candidate-only"],
      ["only-cand", "candidate-only"],
    ]);
    expect(rows[1].deltaSeconds).toBeUndefined();
    expect(rows[1].caveats).toEqual(["Not in candidate run"]);
    expect(rows[2].caveats).toEqual(["Not in baseline run"]);
  });

  it("keeps duplicate names instead of dropping them", () => {
    const rows = compareRuns(run(result("a", 1), result("a", 2)), run(result("a", 1), result("a", 2)));
    expect(rows.map((r) => r.name)).toEqual(["a", "a #2"]);
    expect(rows.every((r) => r.kind === "matched")).toBe(true);
  });

  it("adds caveats for small samples, missing stddev, failures and zero baseline", () => {
    const [row] = compareRuns(
      run(result("a", 0, { n: 3, stddev: null })),
      run(result("a", 1, { failed: true })),
    );
    expect(row.deltaPercent).toBeNull();
    expect(row.verdict).toBe("inconclusive");
    expect(row.caveats).toEqual([
      "Only 3 timed runs on one side",
      "No standard deviation reported",
      "Some runs exited non-zero",
      "Baseline mean is 0",
    ]);
  });
});

describe("statistical honesty", () => {
  const withTimes = (command: string, times: number[], stddev = 0.001): CaseResult => {
    const c = result(command, times.reduce((a, b) => a + b, 0) / times.length, { stddev });
    const sorted = [...times].sort((x, y) => x - y);
    c.metrics.times = times;
    c.metrics.median = sorted[Math.floor(sorted.length / 2)];
    return c;
  };

  it("reports a 95% interval of the delta that brackets it", () => {
    const [row] = compareRuns(
      run(result("a", 1.0, { stddev: 0.1, n: 10 })),
      run(result("a", 0.8, { stddev: 0.1, n: 10 })),
    );
    const ci = row.deltaInterval!;
    expect(ci.low).toBeLessThan(row.deltaSeconds!);
    expect(ci.high).toBeGreaterThan(row.deltaSeconds!);
    expect(ci.high).toBeLessThan(0);
    expect(row.deltaPercentInterval!.high).toBeLessThan(0);
    expect(row.verdict).toBe("faster");
  });

  it("calls it inconclusive exactly when the interval spans zero", () => {
    const [row] = compareRuns(
      run(result("a", 1.0, { stddev: 0.3, n: 5 })),
      run(result("a", 1.1, { stddev: 0.3, n: 5 })),
    );
    expect(row.deltaInterval!.low).toBeLessThan(0);
    expect(row.deltaInterval!.high).toBeGreaterThan(0);
    expect(row.verdict).toBe("inconclusive");
  });

  it("has no interval without standard deviations", () => {
    const [row] = compareRuns(run(result("a", 1, { stddev: null })), run(result("a", 2)));
    expect(row.deltaInterval).toBeUndefined();
    expect(row.deltaPercentInterval).toBeNull();
  });

  it("flags a slow first run as a likely cold cache", () => {
    const [row] = compareRuns(
      run(withTimes("a", [0.5, 0.1, 0.1, 0.1, 0.1, 0.1])),
      run(withTimes("a", [0.1, 0.1, 0.1, 0.1, 0.1, 0.1])),
    );
    expect(row.caveats.some((c) => c.startsWith("Baseline: first run was 5.0×"))).toBe(true);
    expect(row.caveats.some((c) => c.startsWith("Candidate"))).toBe(false);
  });
});
