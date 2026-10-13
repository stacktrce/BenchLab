import type { BenchmarkResult, CaseResult } from "../parser/hyperfine.types";

export function result(
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

export const run = (...cases: CaseResult[]): BenchmarkResult => ({ cases });
