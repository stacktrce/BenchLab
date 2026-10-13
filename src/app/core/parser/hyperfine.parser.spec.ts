import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHyperfineJSON } from "./hyperfine.parser";
import { HyperfineParseError } from "./hyperfine.types";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseHyperfineJSON", () => {
  it("parses a single-command run", () => {
    const { cases } = parseHyperfineJSON(fixture("single.json"));
    expect(cases).toHaveLength(1);
    expect(cases[0].command).toBe("cmd /c ver");
    expect(cases[0].metrics.times).toHaveLength(5);
    expect(cases[0].metrics.mean).toBeGreaterThan(0);
    expect(cases[0].hasFailedRuns).toBe(false);
  });

  it("parses multiple commands in order", () => {
    const { cases } = parseHyperfineJSON(fixture("multi.json"));
    expect(cases.map((c) => c.command)).toEqual([
      "cmd /c ver",
      "cmd /c echo hi",
    ]);
  });

  it("parses parameterized runs", () => {
    const { cases } = parseHyperfineJSON(fixture("parameterized.json"));
    expect(cases).toHaveLength(2);
    expect(cases[0].parameters).toEqual({ word: "a" });
    expect(cases[1].parameters).toEqual({ word: "b" });
  });

  it("flags failed runs", () => {
    const { cases } = parseHyperfineJSON(fixture("failure.json"));
    expect(cases[0].hasFailedRuns).toBe(true);
    expect(cases[0].metrics.exitCodes).toEqual([1, 1, 1]);
  });

  it("tolerates missing optional fields and null stddev", () => {
    const json = JSON.stringify({
      results: [
        { command: "x", mean: 1, median: 1, min: 1, max: 1, stddev: null },
      ],
    });
    const { cases } = parseHyperfineJSON(json);
    expect(cases[0].metrics.stddev).toBeNull();
    expect(cases[0].metrics.user).toBeNull();
    expect(cases[0].metrics.times).toEqual([]);
    expect(cases[0].hasFailedRuns).toBe(false);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseHyperfineJSON("{nope")).toThrow(HyperfineParseError);
  });

  it("rejects missing or empty results", () => {
    expect(() => parseHyperfineJSON("{}")).toThrow(/results/);
    expect(() => parseHyperfineJSON('{"results":[]}')).toThrow(/empty/);
  });

  it("names the case and field when a required metric is missing", () => {
    const json = JSON.stringify({ results: [{ command: "foo", mean: 1 }] });
    expect(() => parseHyperfineJSON(json)).toThrow(/"foo".*"median"/);
  });
});
