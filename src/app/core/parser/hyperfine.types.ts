/** Metrics for one benchmarked command. All times are in seconds, as hyperfine reports them. */
export interface CaseMetrics {
  mean: number;
  stddev: number | null;
  median: number;
  min: number;
  max: number;
  user: number | null;
  system: number | null;
  times: number[];
  exitCodes: (number | null)[];
  memoryUsageBytes: number[];
}

export interface CaseResult {
  command: string;
  /** Values of `-L`/`-P` parameters for this case, when present. */
  parameters: Record<string, string>;
  metrics: CaseMetrics;
  /** True when any run exited non-zero (only possible with --ignore-failure). */
  hasFailedRuns: boolean;
}

export interface BenchmarkResult {
  cases: CaseResult[];
}

export class HyperfineParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HyperfineParseError";
  }
}

/** What the Rust `run_benchmark` command returns. */
export interface RunOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Contents of the `--export-json` file, if hyperfine produced one. */
  json: string | null;
  timedOut: boolean;
  cancelled: boolean;
  /** Why hyperfine failed, worded for the user; null when it succeeded or was stopped. */
  failure: string | null;
}

/** Which hyperfine BenchLab found and where it came from. */
export interface ToolInfo {
  path: string;
  source: "override" | "bundled" | "system";
  version: string;
}
