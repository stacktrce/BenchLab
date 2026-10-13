import { GitInfo } from "./models";

/** Display formatting shared by views and exports. Time inputs are seconds. */

/** "main @ 9f2c1d4", with the uncommitted file count when the tree was dirty. */
export function describeGit(g: GitInfo): string {
  const where = `${g.branch ?? "detached"} @ ${g.shortCommit}`;
  if (!g.dirty) return where;
  return `${where}, ${g.changedFiles} uncommitted ${g.changedFiles === 1 ? "file" : "files"}`;
}

export function ms(seconds: number | null | undefined, digits = 2): string {
  return seconds == null ? "—" : `${(seconds * 1000).toFixed(digits)} ms`;
}

export function signedMs(seconds: number | null | undefined, digits = 2): string {
  if (seconds == null) return "—";
  return `${seconds > 0 ? "+" : ""}${(seconds * 1000).toFixed(digits)} ms`;
}

export function percent(p: number | null | undefined, digits = 1): string {
  if (p == null) return "—";
  return `${p > 0 ? "+" : ""}${p.toFixed(digits)}%`;
}
