import { describeGit } from "./format";
import { GitInfo, Suite } from "./models";
import { BenchmarkResult, CaseResult } from "./parser/hyperfine.types";

/** Below this many timed runs, a comparison is flagged as weak evidence. */
export const MIN_RELIABLE_SAMPLES = 5;
/** Two-sided 95% normal quantile. A change counts only when its CI excludes zero. */
export const CI_Z = 1.96;
/** First timed run this many times slower than the median suggests a cold cache. */
export const COLD_START_RATIO = 1.5;

export type Verdict = "faster" | "slower" | "inconclusive";

export interface Side {
  mean: number;
  median: number;
  min: number;
  max: number;
  stddev: number | null;
  samples: number;
  hasFailedRuns: boolean;
  /** times[0] / median, when there are at least 3 timings. */
  firstRunRatio: number | null;
}

export interface Interval {
  low: number;
  high: number;
}

export interface ComparisonRow {
  name: string;
  kind: "matched" | "baseline-only" | "candidate-only";
  baseline?: Side;
  candidate?: Side;
  /** candidate - baseline, seconds. Negative = candidate is faster. */
  deltaSeconds?: number;
  /** (candidate - baseline) / baseline * 100; null when the baseline mean is 0. */
  deltaPercent?: number | null;
  /** 95% interval of the delta in seconds; absent without standard deviations. */
  deltaInterval?: Interval;
  deltaPercentInterval?: Interval | null;
  verdict?: Verdict;
  caveats: string[];
}

function side(c: CaseResult): Side {
  const times = c.metrics.times;
  return {
    mean: c.metrics.mean,
    median: c.metrics.median,
    min: c.metrics.min,
    max: c.metrics.max,
    stddev: c.metrics.stddev,
    samples: times.length || c.metrics.exitCodes.length,
    hasFailedRuns: c.hasFailedRuns,
    firstRunRatio:
      times.length >= 3 && c.metrics.median > 0 ? times[0] / c.metrics.median : null,
  };
}

/** Keys cases by name; a repeated name gets a "#n" suffix so nothing is silently dropped. */
function keyed(result: BenchmarkResult): Map<string, CaseResult> {
  const out = new Map<string, CaseResult>();
  const seen = new Map<string, number>();
  for (const c of result.cases) {
    const n = seen.get(c.command) ?? 0;
    seen.set(c.command, n + 1);
    out.set(n === 0 ? c.command : `${c.command} #${n + 1}`, c);
  }
  return out;
}

/** Standard error of (candidate - baseline); null without usable spread/sample data. */
export function standardError(b: Side, c: Side): number | null {
  if (b.stddev === null || c.stddev === null || b.samples < 2 || c.samples < 2) return null;
  return Math.sqrt(b.stddev ** 2 / b.samples + c.stddev ** 2 / c.samples);
}

/** Welch-style: a change is real only when its 95% interval excludes zero. */
export function judge(b: Side, c: Side): Verdict {
  const delta = c.mean - b.mean;
  const se = standardError(b, c);
  if (se === null) return "inconclusive";
  if (se === 0) return delta === 0 ? "inconclusive" : delta < 0 ? "faster" : "slower";
  if (Math.abs(delta) < CI_Z * se) return "inconclusive";
  return delta < 0 ? "faster" : "slower";
}

function coldStart(label: string, s: Side): string | null {
  return s.firstRunRatio !== null && s.firstRunRatio >= COLD_START_RATIO
    ? `${label}: first run was ${s.firstRunRatio.toFixed(1)}× the median (likely cold cache; try warm-up runs)`
    : null;
}

function caveatsFor(b: Side, c: Side): string[] {
  const out: string[] = [];
  const low = Math.min(b.samples, c.samples);
  if (low < MIN_RELIABLE_SAMPLES) out.push(`Only ${low} timed runs on one side`);
  if (b.stddev === null || c.stddev === null) out.push("No standard deviation reported");
  if (b.hasFailedRuns || c.hasFailedRuns) out.push("Some runs exited non-zero");
  if (b.mean === 0) out.push("Baseline mean is 0");
  for (const w of [coldStart("Baseline", b), coldStart("Candidate", c)]) if (w) out.push(w);
  return out;
}

/** Strict name match. Cases present on one side only are kept and labelled. */
export function compareRuns(baseline: BenchmarkResult, candidate: BenchmarkResult): ComparisonRow[] {
  const base = keyed(baseline);
  const cand = keyed(candidate);
  const rows: ComparisonRow[] = [];

  for (const [name, bc] of base) {
    const cc = cand.get(name);
    if (!cc) {
      rows.push({ name, kind: "baseline-only", baseline: side(bc), caveats: ["Not in candidate run"] });
      continue;
    }
    const b = side(bc);
    const c = side(cc);
    const deltaSeconds = c.mean - b.mean;
    const se = standardError(b, c);
    const deltaInterval =
      se === null ? undefined : { low: deltaSeconds - CI_Z * se, high: deltaSeconds + CI_Z * se };
    const pct = (s: number) => (s / b.mean) * 100;
    rows.push({
      name,
      kind: "matched",
      baseline: b,
      candidate: c,
      deltaSeconds,
      deltaPercent: b.mean === 0 ? null : pct(deltaSeconds),
      deltaInterval,
      deltaPercentInterval:
        deltaInterval && b.mean !== 0
          ? { low: pct(deltaInterval.low), high: pct(deltaInterval.high) }
          : null,
      verdict: judge(b, c),
      caveats: caveatsFor(b, c),
    });
  }
  for (const [name, cc] of cand) {
    if (!base.has(name)) {
      rows.push({ name, kind: "candidate-only", candidate: side(cc), caveats: ["Not in baseline run"] });
    }
  }
  return rows;
}

/**
 * Differences in how the two runs were configured. A "faster" verdict means little
 * if the command itself changed, so these are shown next to the comparison.
 */
export function configDifferences(baseline: Suite | null, candidate: Suite | null): string[] {
  if (!baseline || !candidate) return ["The configuration was not recorded for one of the runs."];
  const out: string[] = [];
  if (baseline.runs !== candidate.runs) out.push(`Timed runs per case: ${baseline.runs} vs ${candidate.runs}`);
  if (baseline.warmup !== candidate.warmup) out.push(`Warm-up runs: ${baseline.warmup} vs ${candidate.warmup}`);
  const base = new Map(baseline.cases.map((c) => [c.name, c]));
  for (const c of candidate.cases) {
    const b = base.get(c.name);
    if (!b) continue;
    if (b.command !== c.command) out.push(`"${c.name}": command changed`);
    if ((b.setupCommand ?? "") !== (c.setupCommand ?? "")) out.push(`"${c.name}": setup command changed`);
    if ((b.cleanupCommand ?? "") !== (c.cleanupCommand ?? "")) out.push(`"${c.name}": cleanup command changed`);
    if ((b.workingDirectory ?? "") !== (c.workingDirectory ?? "")) out.push(`"${c.name}": working directory changed`);
  }
  return out;
}

export interface GitNote {
  kind: "info" | "warn";
  text: string;
}

/**
 * What the recorded git state says about the comparison. Same commit on both sides is worth
 * saying out loud: any difference is then noise or the environment, not the code.
 */
export function gitNotes(baseline: GitInfo[], candidate: GitInfo[]): GitNote[] {
  if (baseline.length === 0 && candidate.length === 0) return [];
  if (baseline.length === 0 || candidate.length === 0) {
    return [{ kind: "info", text: "Git state was recorded for only one of the runs." }];
  }
  const notes: GitNote[] = [];
  const candidateByRoot = new Map(candidate.map((g) => [g.root, g]));
  for (const b of baseline) {
    const c = candidateByRoot.get(b.root);
    if (!c) {
      notes.push({ kind: "info", text: `${b.root} was recorded only for the baseline run.` });
      continue;
    }
    const label = baseline.length > 1 ? `${b.root}: ` : "";
    if (b.commit === c.commit) {
      notes.push({
        kind: "info",
        text: `${label}Same commit in both runs (${b.shortCommit}). Any difference comes from noise or the environment, not from a code change.`,
      });
    } else {
      notes.push({ kind: "info", text: `${label}Code changed: ${describeGit(b)} to ${describeGit(c)}.` });
    }
    for (const [side, g] of [["Baseline", b], ["Candidate", c]] as const) {
      if (g.dirty) {
        notes.push({
          kind: "warn",
          text: `${label}${side} ran with ${g.changedFiles} uncommitted ${g.changedFiles === 1 ? "file" : "files"}, so commit ${g.shortCommit} does not fully describe the code that was measured.`,
        });
      }
    }
  }
  const baselineRoots = new Set(baseline.map((g) => g.root));
  for (const c of candidate) {
    if (!baselineRoots.has(c.root)) notes.push({ kind: "info", text: `${c.root} was recorded only for the candidate run.` });
  }
  return notes;
}

export interface ComparisonSummary {
  faster: number;
  slower: number;
  inconclusive: number;
  unmatched: number;
}

export function summarize(rows: ComparisonRow[]): ComparisonSummary {
  const s: ComparisonSummary = { faster: 0, slower: 0, inconclusive: 0, unmatched: 0 };
  for (const r of rows) {
    if (r.kind !== "matched") s.unmatched++;
    else s[r.verdict ?? "inconclusive"]++;
  }
  return s;
}
