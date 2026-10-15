import { describe, expect, it } from "vitest";
import { compareRuns } from "./compare";
import { RunRecord } from "./models";
import { BenchmarkResult, CaseResult } from "./parser/hyperfine.types";
import { comparisonToWorkbook, runToWorkbook, Workbook } from "./spreadsheet";

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: "r1",
  suiteId: "s1",
  suiteName: "My suite",
  startedAt: "2026-01-02T03:04:05.000Z",
  finishedAt: "2026-01-02T03:04:30.000Z",
  status: "completed",
  toolVersion: "hyperfine 1.20.0",
  caseCount: 1,
  error: null,
  ...over,
});

const caseResult = (command: string, mean: number, stddev: number | null = 0.001): CaseResult => ({
  command,
  parameters: {},
  hasFailedRuns: false,
  metrics: {
    mean, median: mean, min: mean, max: mean, stddev, user: null, system: null,
    times: Array(10).fill(mean), exitCodes: [], memoryUsageBytes: [],
  },
});

const result = (...cases: CaseResult[]): BenchmarkResult => ({ cases });

/** Excel refuses sheet names over 31 characters or with any of []:*?/\ */
function expectWellFormed(book: Workbook) {
  for (const sheet of book.sheets) {
    expect(sheet.name.length).toBeLessThanOrEqual(31);
    expect([...sheet.name].filter((ch) => "[]:*?/\\".includes(ch))).toEqual([]);
    for (const row of sheet.rows) expect(row).toHaveLength(sheet.columns.length);
  }
}

const sheet = (book: Workbook, name: string) => book.sheets.find((s) => s.name === name)!;
const column = (book: Workbook, sheetName: string, title: string) => {
  const s = sheet(book, sheetName);
  const i = s.columns.findIndex((c) => c.title === title);
  expect(i).toBeGreaterThanOrEqual(0);
  return s.rows.map((r) => r[i]);
};

describe("runToWorkbook", () => {
  const book = runToWorkbook(record(), result(caseResult("=cmd", 0.0123), caseResult("no spread", 0.02, null)), []);

  it("is well formed", () => expectWellFormed(book));

  it("stores times as numbers in milliseconds, with an empty cell where a value is missing", () => {
    expect(column(book, "Results", "Mean (ms)")).toEqual([12.3, 20]);
    expect(column(book, "Results", "Std dev (ms)")).toEqual([1, null]);
    expect(sheet(book, "Results").columns.find((c) => c.title === "Mean (ms)")?.decimals).toBe(3);
  });

  it("keeps case names as plain text, even when they look like formulas", () => {
    expect(column(book, "Results", "Case")).toEqual(["=cmd", "no spread"]);
    expect(sheet(book, "Results").columns[0].decimals).toBeNull();
  });

  it("describes the run on a second sheet", () => {
    const notes = sheet(book, "Run").rows.map((r) => r.join(": "));
    expect(notes).toContain("Suite: My suite");
    expect(notes).toContain("Tool: hyperfine 1.20.0");
  });
});

describe("comparisonToWorkbook", () => {
  const rows = compareRuns(
    result(caseResult("fast", 1), caseResult("gone", 1)),
    result(caseResult("fast", 0.5), caseResult("new", 1)),
  );
  const book = comparisonToWorkbook(rows, record({ id: "b" }), record({ id: "c" }), ["runs changed"], []);

  it("is well formed", () => expectWellFormed(book));

  it("puts the change and its interval in numeric columns", () => {
    expect(column(book, "Comparison", "Change (ms)")[0]).toBe(-500);
    expect(column(book, "Comparison", "Change (%)")[0]).toBe(-50);
    const low = column(book, "Comparison", "95% low (%)")[0] as number;
    const high = column(book, "Comparison", "95% high (%)")[0] as number;
    expect(low).toBeLessThan(high);
  });

  it("states a verdict in words, and labels unmatched cases instead of inventing one", () => {
    expect(column(book, "Comparison", "Verdict")).toEqual(["faster", "only in baseline", "only in candidate"]);
  });

  it("carries the method and the configuration differences in its notes", () => {
    const notes = sheet(book, "Notes").rows.map((r) => String(r[0])).join("\n");
    expect(notes).toContain("excludes zero");
    expect(notes).toContain("runs changed");
    expect(notes).toContain("1 faster");
  });
});
