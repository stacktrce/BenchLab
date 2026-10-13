import { describe, expect, it } from "vitest";
import type { Suite } from "../models";
import { configDifferences } from "./config-diff";

describe("configDifferences", () => {
  const suite = (over: Partial<Suite> = {}, command = "echo"): Suite => ({
    id: "s", name: "S", description: "", runs: 10, warmup: 1, baselineRunId: null, schemaVersion: 1, createdAt: "", updatedAt: "",
    cases: [{ id: "c", name: "a", command, setupCommand: null, cleanupCommand: null, workingDirectory: null, enabled: true }],
    ...over,
  });

  it("is empty for identical configuration", () => {
    expect(configDifferences(suite(), suite())).toEqual([]);
  });

  it("reports run count, warm-up and command changes", () => {
    expect(configDifferences(suite(), suite({ runs: 5, warmup: 0 }, "echo hi"))).toEqual([
      "Timed runs per case: 10 vs 5",
      "Warm-up runs: 1 vs 0",
      '"a": command changed',
    ]);
  });

  it("flags a real hook change", () => {
    const withSetup = suite();
    withSetup.cases[0].setupCommand = "make";
    expect(configDifferences(suite(), withSetup)).toEqual(['"a": setup command changed']);
  });

  it("says so when a snapshot is missing", () => {
    expect(configDifferences(null, suite())).toEqual(["The configuration was not recorded for one of the runs."]);
  });
});
