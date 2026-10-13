import type { BenchmarkResult, CaseResult } from "../parser/hyperfine.types";
import { caveatsFor } from "./caveats";
import { CI_Z, judge, standardError } from "./stats";
import type { ComparisonRow, Side } from "./types";

function side(c: CaseResult): Side {
  const times = c.metrics.times;
  return {
    mean: c.metrics.mean,
    median: c.metrics.median,
    min: c.metrics.min,
    max: c.metrics.max,
    stddev: c.metrics.stddev,
    samples: times.length || c.metrics.exitCodes.length,
    hasFailedRuns: c.hasFailedRuns,
    firstRunRatio:
      times.length >= 3 && c.metrics.median > 0 ? times[0] / c.metrics.median : null,
  };
}

/** Keys cases by name; a repeated name gets a "#n" suffix so nothing is silently dropped. */
function keyed(result: BenchmarkResult): Map<string, CaseResult> {
  const out = new Map<string, CaseResult>();
  const seen = new Map<string, number>();
  for (const c of result.cases) {
    const n = seen.get(c.command) ?? 0;
    seen.set(c.command, n + 1);
    out.set(n === 0 ? c.command : `${c.command} #${n + 1}`, c);
  }
  return out;
}

/** Strict name match. Cases present on one side only are kept and labelled. */
export function compareRuns(baseline: BenchmarkResult, candidate: BenchmarkResult): ComparisonRow[] {
  const base = keyed(baseline);
  const cand = keyed(candidate);
  const rows: ComparisonRow[] = [];

  for (const [name, bc] of base) {
    const cc = cand.get(name);
    if (!cc) {
      rows.push({ name, kind: "baseline-only", baseline: side(bc), caveats: ["Not in candidate run"] });
      continue;
    }
    const b = side(bc);
    const c = side(cc);
    const deltaSeconds = c.mean - b.mean;
    const se = standardError(b, c);
    const deltaInterval =
      se === null ? undefined : { low: deltaSeconds - CI_Z * se, high: deltaSeconds + CI_Z * se };
    const pct = (s: number) => (s / b.mean) * 100;
    rows.push({
      name,
      kind: "matched",
      baseline: b,
      candidate: c,
      deltaSeconds,
      deltaPercent: b.mean === 0 ? null : pct(deltaSeconds),
      deltaInterval,
      deltaPercentInterval:
        deltaInterval && b.mean !== 0
          ? { low: pct(deltaInterval.low), high: pct(deltaInterval.high) }
          : null,
      verdict: judge(b, c),
      caveats: caveatsFor(b, c),
    });
  }
  for (const [name, cc] of cand) {
    if (!base.has(name)) {
      rows.push({ name, kind: "candidate-only", candidate: side(cc), caveats: ["Not in baseline run"] });
    }
  }
  return rows;
}
