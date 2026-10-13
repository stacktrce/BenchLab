import { describe, expect, it } from "vitest";
import type { Suite } from "../models";
import { applyBudgets, budgetStatus } from "./budgets";
import { compareRuns } from "./match";
import { summarize } from "./summary";
import { result, run } from "./test-data";

describe("regression budgets", () => {
  const interval = (low: number, high: number) => ({ low, high });

  it("breaches only when the whole interval is above the budget", () => {
    expect(budgetStatus(interval(5.1, 9), 5)).toBe("breach");
    expect(budgetStatus(interval(5, 9), 5)).toBe("unclear");
  });

  it("is met only when the whole interval is at or below the budget", () => {
    expect(budgetStatus(interval(-3, 5), 5)).toBe("within");
    expect(budgetStatus(interval(-3, 5.1), 5)).toBe("unclear");
  });

  it("says unclear when a point estimate is over budget but the interval straddles it", () => {
    expect(budgetStatus(interval(2, 18), 5)).toBe("unclear");
  });

  it("is unclear without an interval instead of guessing from the mean", () => {
    expect(budgetStatus(null, 5)).toBe("unclear");
    expect(budgetStatus(undefined, 5)).toBe("unclear");
  });

  const config = (budgets: Record<string, number | null | undefined>): Suite => ({
    id: "s", name: "S", description: "", runs: 10, warmup: 1, baselineRunId: null, schemaVersion: 1, createdAt: "", updatedAt: "",
    cases: Object.entries(budgets).map(([name, budgetPercent]) => ({
      id: name, name, command: "x", setupCommand: null, cleanupCommand: null, workingDirectory: null, enabled: true, budgetPercent,
    })),
  });

  const rows = () =>
    compareRuns(
      run(result("slow", 1.0, { stddev: 0.01 }), result("flat", 1.0, { stddev: 0.01 }), result("free", 1.0), result("gone", 1)),
      run(result("slow", 1.3, { stddev: 0.01 }), result("flat", 1.0, { stddev: 0.01 }), result("free", 2.0), result("new", 1)),
    );

  it("attaches a status to cases that have a budget and leaves the rest alone", () => {
    const out = applyBudgets(rows(), config({ slow: 10, flat: 10, free: undefined }));
    const by = Object.fromEntries(out.map((r) => [r.name, r.budget]));
    expect(by["slow"]).toEqual({ percent: 10, status: "breach" });
    expect(by["flat"]).toEqual({ percent: 10, status: "within" });
    expect(by["free"]).toBeUndefined();
    expect(summarize(out).overBudget).toBe(1);
  });

  it("ignores budgets on unmatched cases and non-positive values, and old snapshots", () => {
    expect(applyBudgets(rows(), config({ gone: 5, new: 5, slow: 0, flat: -1 })).every((r) => r.budget === undefined)).toBe(true);
    expect(applyBudgets(rows(), null)).toEqual(rows());
  });

  it("does not change the verdict: a breach is a separate fact from faster or slower", () => {
    const before = rows().map((r) => r.verdict);
    const after = applyBudgets(rows(), config({ slow: 10 })).map((r) => r.verdict);
    expect(after).toEqual(before);
  });
});
