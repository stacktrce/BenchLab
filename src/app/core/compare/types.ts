export type Verdict = "faster" | "slower" | "inconclusive";

export interface Side {
  mean: number;
  median: number;
  min: number;
  max: number;
  stddev: number | null;
  samples: number;
  hasFailedRuns: boolean;
  /** times[0] / median, when there are at least 3 timings. */
  firstRunRatio: number | null;
}

export interface Interval {
  low: number;
  high: number;
}

export type BudgetStatus = "within" | "breach" | "unclear";

export interface BudgetResult {
  percent: number;
  status: BudgetStatus;
}

export interface ComparisonRow {
  name: string;
  kind: "matched" | "baseline-only" | "candidate-only";
  baseline?: Side;
  candidate?: Side;
  /** candidate - baseline, seconds. Negative = candidate is faster. */
  deltaSeconds?: number;
  /** (candidate - baseline) / baseline * 100; null when the baseline mean is 0. */
  deltaPercent?: number | null;
  /** 95% interval of the delta in seconds; absent without standard deviations. */
  deltaInterval?: Interval;
  deltaPercentInterval?: Interval | null;
  verdict?: Verdict;
  budget?: BudgetResult;
  caveats: string[];
}
