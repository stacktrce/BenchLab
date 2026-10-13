import { describe, expect, it } from "vitest";
import { validateSuite } from "./suite-validation";

const ok = { name: "S", runs: 10, cases: [{ name: "a", command: "echo" }] };

describe("validateSuite", () => {
  it("accepts a valid suite", () => {
    expect(validateSuite(ok)).toEqual([]);
  });

  it("reports every problem at once", () => {
    const problems = validateSuite({
      name: " ",
      runs: 0,
      cases: [
        { name: "a", command: "" },
        { name: "a", command: "x" },
        { name: "", command: "x" },
      ],
    });
    expect(problems).toEqual([
      "Suite name is required.",
      "Runs must be at least 1.",
      'Case "a": command is required.',
      'Case "a": name is used more than once.',
      "Case 3: name is required.",
    ]);
  });

  it("rejects negative or fractional warm-up", () => {
    expect(validateSuite({ ...ok, warmup: -1 })).toEqual(["Warm-up runs cannot be negative."]);
    expect(validateSuite({ ...ok, warmup: 0 })).toEqual([]);
    expect(validateSuite({ ...ok, warmup: 1.5 })).toHaveLength(1);
  });

  it("accepts an empty budget and rejects zero or negative ones", () => {
    const withBudget = (budgetPercent: number | null) => ({ ...ok, cases: [{ name: "a", command: "echo", budgetPercent }] });
    expect(validateSuite(withBudget(null))).toEqual([]);
    expect(validateSuite(withBudget(5))).toEqual([]);
    expect(validateSuite(withBudget(0))).toEqual(['Case "a": budget must be a number above 0.']);
    expect(validateSuite(withBudget(-3))).toHaveLength(1);
  });

  it("requires at least one case", () => {
    expect(validateSuite({ ...ok, cases: [] })).toEqual(["Add at least one case."]);
  });

  it("rejects fractional or NaN runs", () => {
    expect(validateSuite({ ...ok, runs: 2.5 })).toHaveLength(1);
    expect(validateSuite({ ...ok, runs: NaN })).toHaveLength(1);
  });
});
