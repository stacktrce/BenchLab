import { describe, expect, it } from "vitest";
import { Suite, SuiteCase } from "../../core/models";
import { confirmItems, confirmSummary } from "./run-confirmation";

const kase = (over: Partial<SuiteCase> = {}): SuiteCase => ({
  id: "c", name: "a", command: "echo hi", setupCommand: null, cleanupCommand: null, workingDirectory: null, enabled: true, ...over,
});

const suite = (cases: SuiteCase[], over: Partial<Suite> = {}): Suite => ({
  id: "s", name: "S", description: "", runs: 10, warmup: 1, baselineRunId: null, schemaVersion: 1, createdAt: "", updatedAt: "", cases, ...over,
});

describe("confirmItems", () => {
  it("lists only enabled cases, in order, with every command and hook that will run", () => {
    const items = confirmItems(
      suite([
        kase({ name: "first", command: "one", setupCommand: "make", cleanupCommand: "clean", workingDirectory: "/work" }),
        kase({ name: "off", command: "never", enabled: false }),
        kase({ name: "last", command: "two" }),
      ]),
    );
    expect(items).toEqual([
      { name: "first", command: "one", setupCommand: "make", cleanupCommand: "clean", workingDirectory: "/work" },
      { name: "last", command: "two", setupCommand: null, cleanupCommand: null, workingDirectory: null },
    ]);
  });

  it("never shows the command of a disabled case", () => {
    expect(JSON.stringify(confirmItems(suite([kase({ command: "rm -rf secret", enabled: false })])))).not.toContain("rm -rf");
  });

  it("is empty for no suite, no cases, or only disabled cases", () => {
    expect(confirmItems(null)).toEqual([]);
    expect(confirmItems(suite([]))).toEqual([]);
    expect(confirmItems(suite([kase({ enabled: false })]))).toEqual([]);
  });
});

describe("confirmSummary", () => {
  it("counts enabled cases and timed runs", () => {
    expect(confirmSummary(suite([kase(), kase({ name: "b" }), kase({ name: "c", enabled: false })], { warmup: 0 }))).toBe(
      "2 case(s), 10 timed runs each",
    );
  });

  it("mentions warm-up runs, singular and plural", () => {
    expect(confirmSummary(suite([kase()], { warmup: 1 }))).toBe("1 case(s), 10 timed runs each, after 1 warm-up run");
    expect(confirmSummary(suite([kase()], { warmup: 3, runs: 5 }))).toBe("1 case(s), 5 timed runs each, after 3 warm-up runs");
  });

  it("is empty without a suite", () => {
    expect(confirmSummary(null)).toBe("");
  });
});
