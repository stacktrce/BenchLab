import { describe, expect, it } from "vitest";
import { compareRuns, summarize } from "./compare";
import { runToCsv, runToMarkdown } from "./export";
import { RunRecord } from "./models";
import { parseHyperfineJSON } from "./parser/hyperfine.parser";

const N = 5000;

function hyperfineJson(shift: number): string {
  const results = Array.from({ length: N }, (_, i) => {
    const mean = 0.01 + (i % 50) * 0.001 + shift;
    const times = Array.from({ length: 10 }, (_, k) => mean + ((k % 3) - 1) * 0.0005);
    return {
      command: `case ${i}`, mean, stddev: 0.0005, median: mean, min: mean - 0.0005, max: mean + 0.0005,
      user: 0, system: 0, times, exit_codes: times.map(() => 0),
    };
  });
  return JSON.stringify({ results });
}

const record: RunRecord = {
  id: "r", suiteId: "s", suiteName: "Big", startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:10:00.000Z", status: "completed", toolVersion: "hyperfine 1.20.0",
  caseCount: N, error: null, note: null, tags: [],
};

describe(`${N}-case runs`, () => {
  it("parse, compare, summarise and export without blowing up", () => {
    const t0 = performance.now();
    const base = parseHyperfineJSON(hyperfineJson(0));
    const cand = parseHyperfineJSON(hyperfineJson(0.002));
    const rows = compareRuns(base, cand);
    const summary = summarize(rows);
    const csv = runToCsv(record, base);
    const md = runToMarkdown(record, base, null);
    const elapsed = performance.now() - t0;

    expect(base.cases).toHaveLength(N);
    expect(rows).toHaveLength(N);
    expect(summary.faster + summary.slower + summary.inconclusive).toBe(N);
    expect(summary.slower).toBe(N); // every case got 2 ms slower with tiny variance
    expect(csv.trimEnd().split("\r\n")).toHaveLength(N + 1);
    expect(md).toContain("case 4999");
    expect(elapsed).toBeLessThan(3000); // generous: it takes a fraction of that
  });
});
