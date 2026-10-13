import { RunRecord } from "./models";

export type BaselineChoice = { id: string; reason: "pinned" | "previous" } | null;

/**
 * Which run a candidate is compared against when the user has not picked one.
 * A pinned baseline wins; otherwise the newest earlier run that has results.
 * `runs` is newest first, as the backend returns it.
 */
export function chooseBaseline(runs: RunRecord[], candidateId: string, pinnedId: string | null): BaselineChoice {
  if (pinnedId && pinnedId !== candidateId && runs.some((r) => r.id === pinnedId)) {
    return { id: pinnedId, reason: "pinned" };
  }
  const index = runs.findIndex((r) => r.id === candidateId);
  if (index < 0) return null;
  // A failed run stored no results, so it cannot be compared against.
  const previous = runs.slice(index + 1).find((r) => r.status !== "failed");
  return previous ? { id: previous.id, reason: "previous" } : null;
}
