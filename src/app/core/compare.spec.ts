import { describe, expect, it } from "vitest";
import { compareRuns, configDifferences, judge, summarize } from "./compare";
import { Suite } from "./models";
import { BenchmarkResult, CaseResult } from "./parser/hyperfine.types";

function result(
  command: string,
  mean: number,
  opts: { stddev?: number | null; n?: number; failed?: boolean } = {},
): CaseResult {
  const n = opts.n ?? 10;
  return {
    command,
    parameters: {},
    hasFailedRuns: opts.failed ?? false,
    metrics: {
      mean,
      median: mean,
      min: mean,
      max: mean,
      stddev: opts.stddev === undefined ? 0.001 : opts.stddev,
      user: null,
      system: null,
      times: Array(n).fill(mean),
      exitCodes: [],
      memoryUsageBytes: [],
    },
  };
}

const run = (...cases: CaseResult[]): BenchmarkResult => ({ cases });

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

describe("judge", () => {
  const s = (mean: number, stddev: number | null, samples: number) => ({
    mean,
    median: mean,
    min: mean,
    max: mean,
    stddev,
    samples,
    hasFailedRuns: false,
    firstRunRatio: null,
  });

  it("needs two samples per side", () => {
    expect(judge(s(1, 0.1, 1), s(2, 0.1, 10))).toBe("inconclusive");
  });

  it("treats zero variance with a real difference as significant, and identical as inconclusive", () => {
    expect(judge(s(1, 0, 5), s(2, 0, 5))).toBe("slower");
    expect(judge(s(1, 0, 5), s(1, 0, 5))).toBe("inconclusive");
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

  it("summarises verdict counts", () => {
    const rows = compareRuns(
      run(result("fast", 1), result("slow", 1), result("same", 1, { stddev: 1 }), result("gone", 1)),
      run(result("fast", 0.5), result("slow", 2), result("same", 1.01, { stddev: 1 })),
    );
    expect(summarize(rows)).toEqual({ faster: 1, slower: 1, inconclusive: 1, unmatched: 1 });
  });
});

describe("configDifferences", () => {
  const suite = (over: Partial<Suite> = {}, command = "echo"): Suite => ({
    id: "s", name: "S", description: "", runs: 10, warmup: 1, baselineRunId: null, schemaVersion: 1, createdAt: "", updatedAt: "",
    cases: [{ id: "c", name: "a", command, setupCommand: null, cleanupCommand: null, workingDirectory: null, enabled: true }],
    ...over,
  });

  it("is empty for identical configuration", () => {
    expect(configDifferences(suite(), suite())).toEqual([]);
  });

  it("reports run count, warm-up and command changes", () => {
    expect(configDifferences(suite(), suite({ runs: 5, warmup: 0 }, "echo hi"))).toEqual([
      "Timed runs per case: 10 vs 5",
      "Warm-up runs: 1 vs 0",
      '"a": command changed',
    ]);
  });

  it("flags a real hook change", () => {
    const withSetup = suite();
    withSetup.cases[0].setupCommand = "make";
    expect(configDifferences(suite(), withSetup)).toEqual(['"a": setup command changed']);
  });

  it("says so when a snapshot is missing", () => {
    expect(configDifferences(null, suite())).toEqual(["The configuration was not recorded for one of the runs."]);
  });
});
