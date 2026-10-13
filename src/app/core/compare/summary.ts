import type { ComparisonRow } from "./types";

export interface ComparisonSummary {
  faster: number;
  slower: number;
  inconclusive: number;
  unmatched: number;
  /** Cases whose budget is confidently breached. */
  overBudget: number;
}

export function summarize(rows: ComparisonRow[]): ComparisonSummary {
  const s: ComparisonSummary = { faster: 0, slower: 0, inconclusive: 0, unmatched: 0, overBudget: 0 };
  for (const r of rows) {
    if (r.kind !== "matched") s.unmatched++;
    else s[r.verdict ?? "inconclusive"]++;
    if (r.budget?.status === "breach") s.overBudget++;
  }
  return s;
}
