import { ComparisonRow, GitNote, summarize } from "./compare";
import { describeGit, ms, percent, signedMs } from "./format";
import { GitInfo, RunRecord, Suite } from "./models";
import { BenchmarkResult } from "./parser/hyperfine.types";

const BUDGET_TEXT = {
  breach: "over budget",
  within: "within budget",
  unclear: "cannot tell from this data",
} as const;

const VERDICT_TEXT = { faster: "faster", slower: "slower", inconclusive: "within noise" } as const;

/** Inline code span that survives backticks and pipes inside table cells. */
function code(text: string): string {
  const flat = text.replace(/\r?\n/g, " ");
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${flat.includes("`") ? ` ${flat} ` : flat}${fence}`.replace(/\|/g, "\\|");
}

function cell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function table(header: string[], rows: string[][], rightAlignFrom = 1): string {
  const align = header.map((_, i) => (i >= rightAlignFrom ? "---:" : "---"));
  return [header, align, ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

function runMeta(r: RunRecord): string {
  return `${r.startedAt} · ${r.status} · ${r.toolVersion} · ${r.caseCount} case(s)`;
}

/** `suite` is the configuration snapshot taken when the run happened; null for older runs. */
export function runToMarkdown(
  record: RunRecord,
  result: BenchmarkResult | null,
  suite: Suite | null,
  git: GitInfo[] = [],
): string {
  const out: string[] = [`# ${record.suiteName}`, "", runMeta(record), ""];
  for (const g of git) out.push(`Code: ${code(describeGit(g))} in ${code(g.root)}`, "");

  if (suite) {
    out.push(
      "## Suite configuration (at run time)",
      "",
      `Runs per case: ${suite.runs} · warm-up runs: ${suite.warmup}`,
      "",
      table(
        ["Case", "Command", "Setup", "Cleanup", "Directory", "Enabled"],
        suite.cases.map((c) => [
          cell(c.name),
          code(c.command),
          c.setupCommand ? code(c.setupCommand) : "",
          c.cleanupCommand ? code(c.cleanupCommand) : "",
          c.workingDirectory ? code(c.workingDirectory) : "",
          c.enabled ? "yes" : "no",
        ]),
        6,
      ),
      "",
    );
  }

  if (record.error) out.push("## Cases that did not complete", "", "```", record.error, "```", "");

  if (result) {
    out.push(
      "## Results",
      "",
      table(
        ["Case", "Mean", "Median", "Std dev", "Min", "Max", "Runs"],
        result.cases.map((c) => [
          cell(c.command),
          ms(c.metrics.mean),
          ms(c.metrics.median),
          ms(c.metrics.stddev),
          ms(c.metrics.min),
          ms(c.metrics.max),
          String(c.metrics.times.length || c.metrics.exitCodes.length),
        ]),
      ),
      "",
    );
  }
  return out.join("\n");
}

/** Cells that a spreadsheet would execute as formulas are prefixed with an apostrophe. */
function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csvNum(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

export function runToCsv(record: RunRecord, result: BenchmarkResult): string {
  const header = [
    "run_id", "suite", "started_at", "tool_version", "case",
    "mean_s", "median_s", "stddev_s", "min_s", "max_s", "user_s", "system_s", "runs", "failed_runs",
  ];
  const rows = result.cases.map((c) => [
    csvText(record.id),
    csvText(record.suiteName),
    csvText(record.startedAt),
    csvText(record.toolVersion),
    csvText(c.command),
    csvNum(c.metrics.mean),
    csvNum(c.metrics.median),
    csvNum(c.metrics.stddev),
    csvNum(c.metrics.min),
    csvNum(c.metrics.max),
    csvNum(c.metrics.user),
    csvNum(c.metrics.system),
    String(c.metrics.times.length || c.metrics.exitCodes.length),
    c.hasFailedRuns ? "true" : "false",
  ]);
  return [header, ...rows].map((r) => r.join(",")).join("\r\n") + "\r\n";
}

function interval(low: number, high: number, fmt: (n: number) => string): string {
  return `${fmt(low)} … ${fmt(high)}`;
}

export function comparisonToMarkdown(
  rows: ComparisonRow[],
  baseline: RunRecord,
  candidate: RunRecord,
  configChanges: string[] = [],
  gitNotes: GitNote[] = [],
): string {
  const s = summarize(rows);
  const headline = [
    `${s.faster} faster`,
    `${s.slower} slower`,
    `${s.inconclusive} within noise`,
    ...(s.unmatched ? [`${s.unmatched} unmatched`] : []),
  ].join(", ");

  const out: string[] = [
    `# ${candidate.suiteName}: comparison`,
    "",
    `Baseline: ${runMeta(baseline)}`,
    "",
    `Candidate: ${runMeta(candidate)}`,
    "",
    `**${headline}**`,
    "",
    table(
      ["Case", "Baseline", "Candidate", "Δ", "Δ %", "95% interval (Δ %)", "Verdict"],
      rows.map((r) => [
        cell(r.name),
        r.baseline ? `${ms(r.baseline.mean)} ± ${ms(r.baseline.stddev)} (n=${r.baseline.samples})` : "—",
        r.candidate ? `${ms(r.candidate.mean)} ± ${ms(r.candidate.stddev)} (n=${r.candidate.samples})` : "—",
        signedMs(r.deltaSeconds),
        percent(r.deltaPercent),
        r.deltaPercentInterval ? interval(r.deltaPercentInterval.low, r.deltaPercentInterval.high, (n) => percent(n)) : "—",
        r.kind === "matched" ? VERDICT_TEXT[r.verdict ?? "inconclusive"] : r.kind.replace("-", " "),
      ]),
      1,
    ),
    "",
  ];

  if (gitNotes.length) {
    out.push("## Code state", "", ...gitNotes.map((n) => `- ${n.kind === "warn" ? "**Warning:** " : ""}${n.text}`), "");
  }
  if (configChanges.length) {
    out.push("## Configuration differs between the runs", "", ...configChanges.map((c) => `- ${c}`), "");
  }

  const budgeted = rows.filter((r) => r.budget);
  if (budgeted.length) {
    out.push(
      "## Regression budgets",
      "",
      table(
        ["Case", "Budget", "Change", "95% interval", "Status"],
        budgeted.map((r) => [
          cell(r.name),
          `${r.budget!.percent}%`,
          percent(r.deltaPercent),
          r.deltaPercentInterval ? interval(r.deltaPercentInterval.low, r.deltaPercentInterval.high, (n) => percent(n)) : "—",
          BUDGET_TEXT[r.budget!.status],
        ]),
        1,
      ),
      "",
    );
  }

  const caveats = rows.filter((r) => r.caveats.length);
  if (caveats.length) {
    out.push("## Caveats", "");
    for (const r of caveats) for (const c of r.caveats) out.push(`- **${cell(r.name)}**: ${c}`);
    out.push("");
  }
  out.push(
    "Δ = candidate − baseline, so negative is faster. A case is called faster or slower only when the " +
      "95% interval of the difference (Welch-style, from the reported standard deviations and run counts) " +
      "excludes zero.",
    "",
  );
  return out.join("\n");
}

export function comparisonToCsv(rows: ComparisonRow[]): string {
  const header = [
    "case", "kind", "baseline_mean_s", "candidate_mean_s", "delta_s", "delta_pct",
    "delta_pct_low", "delta_pct_high", "verdict", "caveats", "budget_pct", "budget_status",
  ];
  const body = rows.map((r) => [
    csvText(r.name),
    r.kind,
    csvNum(r.baseline?.mean),
    csvNum(r.candidate?.mean),
    csvNum(r.deltaSeconds),
    csvNum(r.deltaPercent),
    csvNum(r.deltaPercentInterval?.low),
    csvNum(r.deltaPercentInterval?.high),
    r.verdict ?? "",
    csvText(r.caveats.join("; ")),
    csvNum(r.budget?.percent),
    r.budget?.status ?? "",
  ]);
  return [header, ...body].map((r) => r.join(",")).join("\r\n") + "\r\n";
}
