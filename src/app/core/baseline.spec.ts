import { describe, expect, it } from "vitest";
import { chooseBaseline } from "./baseline";
import { RunRecord } from "./models";

const run = (id: string, status: RunRecord["status"] = "completed"): RunRecord => ({
  id, suiteId: "s", suiteName: "S", startedAt: "", finishedAt: "", status, toolVersion: "v", caseCount: 1, error: null,
});

// newest first, like the backend returns them
const runs = [run("r4"), run("r3", "failed"), run("r2", "partial"), run("r1")];

describe("chooseBaseline", () => {
  it("prefers the pinned run", () => {
    expect(chooseBaseline(runs, "r4", "r1")).toEqual({ id: "r1", reason: "pinned" });
  });

  it("falls back to the previous run when nothing is pinned", () => {
    expect(chooseBaseline(runs, "r2", null)).toEqual({ id: "r1", reason: "previous" });
  });

  it("skips failed runs because they have no results", () => {
    expect(chooseBaseline(runs, "r4", null)).toEqual({ id: "r2", reason: "previous" });
  });

  it("does not compare a run with itself when it is the pinned one", () => {
    expect(chooseBaseline(runs, "r1", "r1")).toBeNull();
    expect(chooseBaseline(runs, "r2", "r2")).toEqual({ id: "r1", reason: "previous" });
  });

  it("ignores a pin that is not among the runs", () => {
    expect(chooseBaseline(runs, "r4", "gone")).toEqual({ id: "r2", reason: "previous" });
  });

  it("returns null for the oldest run and for an unknown candidate", () => {
    expect(chooseBaseline(runs, "r1", null)).toBeNull();
    expect(chooseBaseline(runs, "nope", null)).toBeNull();
  });

  it("returns null when every earlier run failed", () => {
    expect(chooseBaseline([run("b"), run("a", "failed")], "b", null)).toBeNull();
  });
});
