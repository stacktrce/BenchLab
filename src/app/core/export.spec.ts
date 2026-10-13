import { describe, expect, it } from "vitest";
import { compareRuns } from "./compare";
import { comparisonToCsv, comparisonToMarkdown, runToCsv, runToMarkdown } from "./export";
import { RunRecord, Suite } from "./models";
import { BenchmarkResult, CaseResult } from "./parser/hyperfine.types";

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

const caseResult = (command: string, mean: number): CaseResult => ({
  command,
  parameters: {},
  hasFailedRuns: false,
  metrics: {
    mean, median: mean, min: mean, max: mean, stddev: 0.001, user: null, system: null,
    times: Array(10).fill(mean), exitCodes: [], memoryUsageBytes: [],
  },
});

const result = (...cases: CaseResult[]): BenchmarkResult => ({ cases });

const suite: Suite = {
  id: "s1", name: "My suite", description: "", runs: 10, warmup: 1, baselineRunId: null, schemaVersion: 1,
  createdAt: "", updatedAt: "",
  cases: [
    { id: "c1", name: "a|b", command: "echo `x` | cat", setupCommand: null, cleanupCommand: null, workingDirectory: null, enabled: true },
  ],
};

describe("runToMarkdown", () => {
  it("renders metadata, config and a results table", () => {
    const md = runToMarkdown(record(), result(caseResult("a|b", 0.0123)), suite);
    expect(md).toContain("# My suite");
    expect(md).toContain("hyperfine 1.20.0");
    expect(md).toContain("| Case | Mean | Median | Std dev | Min | Max | Runs |");
    expect(md).toContain("| --- | ---: |");
    expect(md).toContain("12.30 ms");
    expect(md).toContain("(at run time)");
  });

  it("escapes pipes and backticks so the table stays intact", () => {
    const md = runToMarkdown(record(), null, suite);
    const row = md.split("\n").find((l) => l.startsWith("| a\\|b"))!;
    expect(row).toContain("a\\|b");
    expect(row).toContain("`` echo `x` \\| cat ``");
    // unescaped pipes only separate the 6 columns
    expect(row.replace(/\\\|/g, "").split("|").length).toBe(8);
  });

  it("includes the error block for partial runs and omits config when absent", () => {
    const md = runToMarkdown(record({ status: "partial", error: '"bad": exited 3' }), null, null);
    expect(md).toContain('"bad": exited 3');
    expect(md).not.toContain("Suite configuration");
  });
});

describe("runToCsv", () => {
  it("emits a header and one RFC 4180 row per case with raw seconds", () => {
    const csv = runToCsv(record(), result(caseResult('say "hi", ok', 0.5)));
    const [header, row] = csv.trimEnd().split("\r\n");
    expect(header.split(",")).toHaveLength(14);
    expect(row).toContain('"say ""hi"", ok"');
    expect(row).toContain(",0.5,");
  });

  it("neutralises spreadsheet formula injection in text cells", () => {
    const csv = runToCsv(record(), result(caseResult("=HYPERLINK(\"x\")", 1), caseResult("-1+1", 1), caseResult("@sum", 1)));
    const rows = csv.trimEnd().split("\r\n").slice(1);
    expect(rows[0]).toContain("\"'=HYPERLINK");
    expect(rows[1]).toContain(",'-1+1,");
    expect(rows[2]).toContain(",'@sum,");
  });

  it("leaves missing numbers empty", () => {
    const c = caseResult("a", 1);
    c.metrics.stddev = null;
    const row = runToCsv(record(), result(c)).trimEnd().split("\r\n")[1].split(",");
    expect(row[7]).toBe("");
  });
});

describe("comparison exports", () => {
  const rows = compareRuns(
    result(caseResult("fast", 1), caseResult("gone", 1)),
    result(caseResult("fast", 0.5), caseResult("new", 1)),
  );

  it("summarises, tabulates deltas and lists caveats", () => {
    const md = comparisonToMarkdown(rows, record({ id: "b" }), record({ id: "c" }));
    expect(md).toContain("**1 faster, 0 slower, 0 within noise, 2 unmatched**");
    expect(md).toContain("-50.0%");
    expect(md).toContain("candidate only");
    expect(md).toContain("baseline only");
    expect(md).toContain("- **gone**: Not in candidate run");
    expect(md).toContain("excludes zero");
  });

  it("lists configuration changes when given", () => {
    const md = comparisonToMarkdown(rows, record(), record(), ['"fast": command changed']);
    expect(md).toContain("## Configuration differs between the runs");
    expect(md).toContain('- "fast": command changed');
    expect(comparisonToMarkdown(rows, record(), record())).not.toContain("Configuration differs");
  });

  it("exports machine-readable rows", () => {
    const [header, fast] = comparisonToCsv(rows).trimEnd().split("\r\n");
    expect(header.startsWith("case,kind,baseline_mean_s")).toBe(true);
    expect(fast.startsWith("fast,matched,1,0.5,-0.5,-50,")).toBe(true);
    expect(fast).toContain(",faster,");
  });
});
