import { median } from "./charts/numbers";

/** Mirrors the Rust `runs::events::RunEvent`, sent as `run-progress`. */
export type RunEvent =
  | { type: "started"; suiteId: string; total: number }
  | { type: "caseStarted"; index: number; total: number; name: string }
  | { type: "caseFinished"; index: number; ok: boolean; message: string | null }
  | { type: "finished"; runId: string | null; status: string };

export interface RunProgress {
  suiteId: string;
  total: number;
  done: number;
  caseName: string | null;
  /** Epoch milliseconds. */
  startedAt: number;
  caseStartedAt: number;
  failures: { name: string; message: string | null }[];
  finished: boolean;
  runId: string | null;
}

/** Applies one event. Events that do not belong to a run in progress leave the state as it is. */
export function foldProgress(state: RunProgress | null, event: RunEvent, now: number): RunProgress | null {
  if (event.type === "started") {
    return {
      suiteId: event.suiteId, total: event.total, done: 0, caseName: null, startedAt: now, caseStartedAt: now,
      failures: [], finished: false, runId: null,
    };
  }
  if (!state || state.finished) return state;
  switch (event.type) {
    case "caseStarted":
      return { ...state, caseName: event.name, caseStartedAt: now };
    case "caseFinished":
      return {
        ...state,
        done: state.done + 1,
        failures: event.ok ? state.failures : [...state.failures, { name: state.caseName ?? "", message: event.message }],
      };
    case "finished":
      return { ...state, finished: true, runId: event.runId };
  }
}

const RECENT_RUNS = 3;

/**
 * Seconds left, from how long the suite's recent completed runs took: their median, split evenly
 * over the cases, for the cases not done yet, minus the time already spent on the current one.
 * Null without history, so nothing is made up.
 */
export function estimateRemainingSeconds(
  pastDurations: number[],
  doneCases: number,
  totalCases: number,
  secondsOnCurrentCase: number,
): number | null {
  if (pastDurations.length === 0 || totalCases === 0) return null;
  const perCase = median(pastDurations.slice(0, RECENT_RUNS)) / totalCases;
  return Math.max(0, perCase * (totalCases - doneCases) - secondsOnCurrentCase);
}

export function formatClock(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
