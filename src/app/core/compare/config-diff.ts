import type { Suite } from "../models";

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
