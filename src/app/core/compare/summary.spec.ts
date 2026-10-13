import { describe, expect, it } from "vitest";
import { compareRuns } from "./match";
import { summarize } from "./summary";
import { result, run } from "./test-data";

describe("summarize", () => {
  it("summarises verdict counts", () => {
    const rows = compareRuns(
      run(result("fast", 1), result("slow", 1), result("same", 1, { stddev: 1 }), result("gone", 1)),
      run(result("fast", 0.5), result("slow", 2), result("same", 1.01, { stddev: 1 })),
    );
    expect(summarize(rows)).toEqual({ faster: 1, slower: 1, inconclusive: 1, unmatched: 1, overBudget: 0 });
  });
});
