import type { Side, Verdict } from "./types";

/** Two-sided 95% normal quantile. A change counts only when its CI excludes zero. */
export const CI_Z = 1.96;

/** Standard error of (candidate - baseline); null without usable spread/sample data. */
export function standardError(b: Side, c: Side): number | null {
  if (b.stddev === null || c.stddev === null || b.samples < 2 || c.samples < 2) return null;
  return Math.sqrt(b.stddev ** 2 / b.samples + c.stddev ** 2 / c.samples);
}

/** Welch-style: a change is real only when its 95% interval excludes zero. */
export function judge(b: Side, c: Side): Verdict {
  const delta = c.mean - b.mean;
  const se = standardError(b, c);
  if (se === null) return "inconclusive";
  if (se === 0) return delta === 0 ? "inconclusive" : delta < 0 ? "faster" : "slower";
  if (Math.abs(delta) < CI_Z * se) return "inconclusive";
  return delta < 0 ? "faster" : "slower";
}
