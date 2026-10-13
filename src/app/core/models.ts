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
