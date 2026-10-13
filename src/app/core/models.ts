export interface SuiteCase {
  /** Empty until the case has been saved. */
  id: string;
  name: string;
  command: string;
  setupCommand: string | null;
  cleanupCommand: string | null;
  workingDirectory: string | null;
  enabled: boolean;
}

export interface Suite {
  /** Empty until the suite has been saved. */
  id: string;
  name: string;
  description: string;
  runs: number;
  /** Untimed runs before measuring, to fill caches. */
  warmup: number;
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

export interface RunDetail {
  record: RunRecord;
  /** Suite configuration when the run happened; null for runs recorded before snapshots existed. */
  config: Suite | null;
  /** Merged hyperfine JSON for the cases that completed. */
  rawOutput: string | null;
}
