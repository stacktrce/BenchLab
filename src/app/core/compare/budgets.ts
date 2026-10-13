import type { Suite } from "../models";
import type { BudgetStatus, ComparisonRow, Interval } from "./types";

/**
 * A budget is breached only when the whole 95% interval of the change lies above it, and met
 * only when the whole interval lies at or below it. Anything else, including a missing interval,
 * is unclear: the data cannot say, and the view says so instead of guessing.
 */
export function budgetStatus(interval: Interval | null | undefined, percent: number): BudgetStatus {
  if (!interval) return "unclear";
  if (interval.low > percent) return "breach";
  if (interval.high <= percent) return "within";
  return "unclear";
}

/** Attaches budgets from the candidate run's configuration (the budgets in force when it ran). */
export function applyBudgets(rows: ComparisonRow[], config: Suite | null): ComparisonRow[] {
  const budgets = new Map<string, number>();
  for (const c of config?.cases ?? []) {
    if (c.budgetPercent != null && c.budgetPercent > 0) budgets.set(c.name, c.budgetPercent);
  }
  if (budgets.size === 0) return rows;
  return rows.map((row) => {
    const percent = budgets.get(row.name);
    if (percent === undefined || row.kind !== "matched") return row;
    return { ...row, budget: { percent, status: budgetStatus(row.deltaPercentInterval, percent) } };
  });
}
