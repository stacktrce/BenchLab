import { ComparisonRow, GitNote, summarize } from "./compare";
import { BUDGET_TEXT, METHOD_NOTE, VERDICT_TEXT } from "./export";
import { describeGit } from "./format";
import { GitInfo, RunRecord } from "./models";
import { BenchmarkResult } from "./parser/hyperfine.types";

/** Mirrors the Rust `files::Workbook` that `write_xlsx_file` takes. */
export interface Workbook {
  sheets: Sheet[];
}

export interface Sheet {
  /** At most 31 characters, none of []:*?/\ (Excel's rules). */
  name: string;
  columns: SheetColumn[];
  rows: SheetValue[][];
}

export interface SheetColumn {
  title: string;
  /** Decimal places for a number column; null for text. */
  decimals: number | null;
}

/** null is an empty cell. Strings are always stored as text, never as formulas. */
export type SheetValue = string | number | null;

const TEXT = null;
const MS = 3;
const PERCENT = 1;
const COUNT = 0;

const toMs = (seconds: number | null | undefined): number | null => (seconds == null ? null : seconds * 1000);

function noteSheet(name: string, lines: string[]): Sheet {
  return { name, columns: [{ title: "Note", decimals: TEXT }], rows: lines.map((l) => [l]) };
}

export function runToWorkbook(record: RunRecord, result: BenchmarkResult | null, git: GitInfo[]): Workbook {
  const results: Sheet = {
    name: "Results",
    columns: [
      { title: "Case", decimals: TEXT },
      { title: "Mean (ms)", decimals: MS },
      { title: "Median (ms)", decimals: MS },
      { title: "Std dev (ms)", decimals: MS },
      { title: "Min (ms)", decimals: MS },
      { title: "Max (ms)", decimals: MS },
      { title: "User (ms)", decimals: MS },
      { title: "System (ms)", decimals: MS },
      { title: "Runs", decimals: COUNT },
      { title: "Some runs failed", decimals: TEXT },
    ],
    rows: (result?.cases ?? []).map((c) => [
      c.command,
      toMs(c.metrics.mean),
      toMs(c.metrics.median),
      toMs(c.metrics.stddev),
      toMs(c.metrics.min),
      toMs(c.metrics.max),
      toMs(c.metrics.user),
      toMs(c.metrics.system),
      c.metrics.times.length || c.metrics.exitCodes.length,
      c.hasFailedRuns ? "yes" : "no",
    ]),
  };
  const run: Sheet = {
    name: "Run",
    columns: [
      { title: "Field", decimals: TEXT },
      { title: "Value", decimals: TEXT },
    ],
    rows: [
      ["Suite", record.suiteName],
      ["Started", record.startedAt],
      ["Status", record.status],
      ["Tool", record.toolVersion],
      ["Cases", String(record.caseCount)],
      ...git.map((g): SheetValue[] => ["Code", `${describeGit(g)} in ${g.root}`]),
      ...(record.error ? [["Cases that did not complete", record.error]] : []),
    ],
  };
  return { sheets: [results, run] };
}

const UNMATCHED_TEXT = { "baseline-only": "only in baseline", "candidate-only": "only in candidate" } as const;

export function comparisonToWorkbook(
  rows: ComparisonRow[],
  baseline: RunRecord,
  candidate: RunRecord,
  configChanges: string[],
  gitNotes: GitNote[],
): Workbook {
  const comparison: Sheet = {
    name: "Comparison",
    columns: [
      { title: "Case", decimals: TEXT },
      { title: "Baseline mean (ms)", decimals: MS },
      { title: "Baseline std dev (ms)", decimals: MS },
      { title: "Baseline runs", decimals: COUNT },
      { title: "Candidate mean (ms)", decimals: MS },
      { title: "Candidate std dev (ms)", decimals: MS },
      { title: "Candidate runs", decimals: COUNT },
      { title: "Change (ms)", decimals: MS },
      { title: "Change (%)", decimals: PERCENT },
      { title: "95% low (%)", decimals: PERCENT },
      { title: "95% high (%)", decimals: PERCENT },
      { title: "Verdict", decimals: TEXT },
      { title: "Budget (%)", decimals: PERCENT },
      { title: "Budget status", decimals: TEXT },
      { title: "Caveats", decimals: TEXT },
    ],
    rows: rows.map((r) => [
      r.name,
      toMs(r.baseline?.mean),
      toMs(r.baseline?.stddev),
      r.baseline?.samples ?? null,
      toMs(r.candidate?.mean),
      toMs(r.candidate?.stddev),
      r.candidate?.samples ?? null,
      toMs(r.deltaSeconds),
      r.deltaPercent ?? null,
      r.deltaPercentInterval?.low ?? null,
      r.deltaPercentInterval?.high ?? null,
      r.kind === "matched" ? VERDICT_TEXT[r.verdict ?? "inconclusive"] : UNMATCHED_TEXT[r.kind],
      r.budget?.percent ?? null,
      r.budget ? BUDGET_TEXT[r.budget.status] : null,
      r.caveats.join("; ") || null,
    ]),
  };

  const s = summarize(rows);
  const notes = noteSheet("Notes", [
    `${s.faster} faster, ${s.slower} slower, ${s.inconclusive} within noise, ${s.unmatched} unmatched`,
    `Baseline: ${baseline.suiteName}, ${baseline.startedAt}, ${baseline.toolVersion}`,
    `Candidate: ${candidate.suiteName}, ${candidate.startedAt}, ${candidate.toolVersion}`,
    ...gitNotes.map((n) => (n.kind === "warn" ? `Warning: ${n.text}` : n.text)),
    ...configChanges.map((c) => `Configuration differs: ${c}`),
    METHOD_NOTE,
  ]);
  return { sheets: [comparison, notes] };
}
