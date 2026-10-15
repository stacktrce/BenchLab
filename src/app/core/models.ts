export interface SuiteCase {
  /** Empty until the case has been saved. */
  id: string;
  name: string;
  command: string;
  setupCommand: string | null;
  cleanupCommand: string | null;
  workingDirectory: string | null;
  enabled: boolean;
  /** Flag the case when it is slower than the baseline by more than this many percent. Absent in snapshots from before budgets existed. */
  budgetPercent?: number | null;
}

export interface Suite {
  /** Empty until the suite has been saved. */
  id: string;
  name: string;
  description: string;
  runs: number;
  /** Untimed runs before measuring, to fill caches. */
  warmup: number;
  /** The run comparisons use by default. Changed only by pinning, never by saving the suite. */
  baselineRunId: string | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  cases: SuiteCase[];
}

export interface SuiteSummary {
  id: string;
  name: string;
  description: string;
  caseCount: number;
  updatedAt: string;
}

export type RunStatus = "completed" | "partial" | "failed";

export interface RunRecord {
  id: string;
  suiteId: string;
  suiteName: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  toolVersion: string;
  caseCount: number;
  error: string | null;
  note: string | null;
  tags: string[];
}

/** A run as the history page lists it, with the code state it measured. */
export interface HistoryRow extends RunRecord {
  git: GitInfo[];
}

export interface Page<T> {
  items: T[];
  /** Matching items in all pages. */
  total: number;
}

/** A repository a case ran in, as it was when the run started. */
export interface GitInfo {
  dir: string;
  root: string;
  commit: string;
  shortCommit: string;
  /** Null on a detached HEAD. */
  branch: string | null;
  dirty: boolean;
  changedFiles: number;
}

/** One case's result in one run, with the code state that run measured. Times are seconds. */
export interface CasePoint {
  runId: string;
  startedAt: string;
  status: RunStatus;
  commit: string | null;
  shortCommit: string | null;
  branch: string | null;
  dirty: boolean;
  mean: number;
  stddev: number | null;
  median: number;
  min: number;
  max: number;
  samples: number;
}

export interface RunDetail {
  record: RunRecord;
  /** Suite configuration when the run happened; null for runs recorded before snapshots existed. */
  config: Suite | null;
  /** Repositories the cases ran in. Empty when none applies or the run predates this. */
  git: GitInfo[];
  /** Merged hyperfine JSON for the cases that completed. */
  rawOutput: string | null;
}

/** One case's log from a run. Bodies are capped; `truncated` says text was cut. */
export interface RunLog {
  case: string;
  /** "hyperfine" is hyperfine's own report; "command" is the benchmarked command's output. */
  stream: "hyperfine" | "command";
  body: string;
  truncated: boolean;
}

/** One untimed run of a failed case, to see what it printed. Mirrors Rust `DiagnoseResult`. */
export interface DiagnoseResult {
  /** The command's own exit code when it ran, else hyperfine's. */
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  durationSeconds: number;
  output: string;
  truncated: boolean;
}

/** Mirrors the Rust `RunFilter`: null fields do not filter. */
export interface RunFilter {
  suiteId: string | null;
  status: string | null;
  from: string | null;
  to: string | null;
  text: string | null;
  tag: string | null;
}
