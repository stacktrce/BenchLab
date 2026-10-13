import { describeGit } from "../format";
import type { GitInfo } from "../models";

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
