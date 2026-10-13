import type { Side } from "./types";

/** Below this many timed runs, a comparison is flagged as weak evidence. */
export const MIN_RELIABLE_SAMPLES = 5;
/** First timed run this many times slower than the median suggests a cold cache. */
export const COLD_START_RATIO = 1.5;


function coldStart(label: string, s: Side): string | null {
  return s.firstRunRatio !== null && s.firstRunRatio >= COLD_START_RATIO
    ? `${label}: first run was ${s.firstRunRatio.toFixed(1)}× the median (likely cold cache; try warm-up runs)`
    : null;
}

export function caveatsFor(b: Side, c: Side): string[] {
  const out: string[] = [];
  const low = Math.min(b.samples, c.samples);
  if (low < MIN_RELIABLE_SAMPLES) out.push(`Only ${low} timed runs on one side`);
  if (b.stddev === null || c.stddev === null) out.push("No standard deviation reported");
  if (b.hasFailedRuns || c.hasFailedRuns) out.push("Some runs exited non-zero");
  if (b.mean === 0) out.push("Baseline mean is 0");
  for (const w of [coldStart("Baseline", b), coldStart("Candidate", c)]) if (w) out.push(w);
  return out;
}
