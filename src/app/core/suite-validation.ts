import { Suite } from "./models";

/**
 * Mirrors the Rust-side validation so the form can show problems before saving.
 * The backend remains authoritative.
 */
export function validateSuite(
  suite: Pick<Suite, "name" | "runs"> & {
    warmup?: number;
    cases: { name: string; command: string; budgetPercent?: number | null }[];
  },
): string[] {
  const problems: string[] = [];
  if (!suite.name.trim()) problems.push("Suite name is required.");
  if (!Number.isInteger(suite.runs) || suite.runs < 1) {
    problems.push("Runs must be at least 1.");
  }
  if (suite.warmup !== undefined && (!Number.isInteger(suite.warmup) || suite.warmup < 0)) {
    problems.push("Warm-up runs cannot be negative.");
  }
  if (suite.cases.length === 0) problems.push("Add at least one case.");

  const seen = new Set<string>();
  suite.cases.forEach((c, i) => {
    const name = c.name.trim();
    const label = name ? `Case "${name}"` : `Case ${i + 1}`;
    if (!name) problems.push(`${label}: name is required.`);
    else if (seen.has(name)) problems.push(`${label}: name is used more than once.`);
    else seen.add(name);
    if (!c.command.trim()) problems.push(`${label}: command is required.`);
    if (c.budgetPercent != null && !(Number.isFinite(c.budgetPercent) && c.budgetPercent > 0)) {
      problems.push(`${label}: budget must be a number above 0.`);
    }
  });
  return problems;
}
