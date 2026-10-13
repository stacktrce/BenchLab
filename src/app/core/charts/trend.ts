import { CI_Z } from "../compare";
import { CasePoint } from "../models";

export interface TrendPoint {
  runId: string;
  startedAt: string;
  mean: number;
  /** 95% band around the mean; null when the spread is unknown or there is a single sample. */
  low: number | null;
  high: number | null;
  /** The run had uncommitted changes, so its commit does not fully describe the code. */
  dirty: boolean;
  label: string;
}

/** The band is the mean plus or minus 1.96 standard errors. Without a spread it is not invented. */
export function trendPoints(series: CasePoint[]): TrendPoint[] {
  return series.map((p) => {
    const half = p.stddev !== null && p.samples >= 2 ? (CI_Z * p.stddev) / Math.sqrt(p.samples) : null;
    return {
      runId: p.runId,
      startedAt: p.startedAt,
      mean: p.mean,
      low: half === null ? null : p.mean - half,
      high: half === null ? null : p.mean + half,
      dirty: p.dirty,
      label: p.shortCommit ? `${p.branch ?? "detached"} @ ${p.shortCommit}` : p.startedAt.slice(0, 10),
    };
  });
}

/** The mean a case may reach before it breaks a budget of `percent` over the baseline. */
export function budgetThreshold(baselineMean: number, percent: number): number {
  return baselineMean * (1 + percent / 100);
}

/**
 * Keeps at most `max` points by taking every k-th one, always including the first and the newest,
 * so a long history stays drawable. `thinned` says whether anything was dropped.
 */
export function thin<T>(points: T[], max: number): { points: T[]; thinned: boolean } {
  if (points.length <= max) return { points, thinned: false };
  const step = Math.ceil((points.length - 1) / (Math.max(max, 2) - 1));
  return { points: points.filter((_, i) => i % step === 0 || i === points.length - 1), thinned: true };
}
