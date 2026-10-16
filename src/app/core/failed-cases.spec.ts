import { describe, expect, it } from "vitest";
import { failedCaseNames } from "./failed-cases";

describe("failedCaseNames", () => {
  const error = [
    '"regex split": Hyperfine stopped: Failed "x": no such file',
    '"a": b": c": The command exited with code 1',
    "Cancelled by user. Remaining cases were not run.",
  ].join("\n");

  it("uses the run's case names, so quotes and colons in a message cannot confuse it", () => {
    expect(failedCaseNames(error, ["regex split", 'a": b": c', "ok"])).toEqual(["regex split", 'a": b": c']);
    expect(failedCaseNames(error, ["a", 'a": b": c', "regex split"])).toEqual(["regex split", 'a": b": c']);
  });

  it("falls back to the text up to the first quote-colon when the case names are unknown", () => {
    expect(failedCaseNames(error, null)).toEqual(["regex split", "a"]);
  });

  it("finds nothing in an empty or absent error", () => {
    expect(failedCaseNames(null, ["a"])).toEqual([]);
    expect(failedCaseNames("", null)).toEqual([]);
  });
});
