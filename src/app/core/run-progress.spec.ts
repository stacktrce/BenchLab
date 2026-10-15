import { describe, expect, it } from "vitest";
import { estimateRemainingSeconds, foldProgress, formatClock, RunEvent, RunProgress } from "./run-progress";

describe("estimateRemainingSeconds", () => {
  it("has no estimate without history or cases", () => {
    expect(estimateRemainingSeconds([], 0, 4, 0)).toBeNull();
    expect(estimateRemainingSeconds([60], 0, 0, 0)).toBeNull();
  });

  it("uses the median of the last three runs, so one outlier does not swing it", () => {
    expect(estimateRemainingSeconds([40, 400, 44], 0, 4, 0)).toBe(44);
  });

  it("counts down by the cases done and the time spent on the current one", () => {
    expect(estimateRemainingSeconds([40], 2, 4, 0)).toBe(20);
    expect(estimateRemainingSeconds([40], 2, 4, 5)).toBe(15);
  });

  it("never goes below zero, and is zero when every case is done", () => {
    expect(estimateRemainingSeconds([40], 3, 4, 30)).toBe(0);
    expect(estimateRemainingSeconds([40], 4, 4, 0)).toBe(0);
  });
});

describe("foldProgress", () => {
  const start: RunEvent = { type: "started", suiteId: "s1", total: 2 };
  const fold = (events: RunEvent[], now = 1_000) =>
    events.reduce<RunProgress | null>((state, e) => foldProgress(state, e, now), null);

  it("tracks the current case and what has finished", () => {
    const state = fold([start, { type: "caseStarted", index: 0, total: 2, name: "a" }]);
    expect(state).toMatchObject({ suiteId: "s1", total: 2, done: 0, caseName: "a", finished: false });
    const after = foldProgress(state, { type: "caseFinished", index: 0, ok: false, message: "boom" }, 2_000);
    expect(after?.done).toBe(1);
    expect(after?.failures).toEqual([{ name: "a", message: "boom" }]);
  });

  it("starts over on a second start", () => {
    const state = fold([start, { type: "caseStarted", index: 0, total: 2, name: "a" }, { ...start, total: 5 }]);
    expect(state).toMatchObject({ total: 5, done: 0, caseName: null });
  });

  it("marks the run finished and ignores late case events until the next start", () => {
    const finished = fold([start, { type: "finished", runId: "r9", status: "completed" }]);
    expect(finished).toMatchObject({ finished: true, runId: "r9" });
    expect(foldProgress(finished, { type: "caseStarted", index: 1, total: 2, name: "late" }, 5)).toBe(finished);
  });

  it("ignores case events that arrive without a start", () => {
    expect(fold([{ type: "caseStarted", index: 0, total: 1, name: "a" }])).toBeNull();
  });
});

describe("formatClock", () => {
  it("shows minutes and seconds, and hours when needed", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(41.6)).toBe("0:42");
    expect(formatClock(70)).toBe("1:10");
    expect(formatClock(3_725)).toBe("1:02:05");
  });
});
