import { describe, expect, it } from "vitest";
import { judge } from "./stats";

describe("judge", () => {
  const s = (mean: number, stddev: number | null, samples: number) => ({
    mean,
    median: mean,
    min: mean,
    max: mean,
    stddev,
    samples,
    hasFailedRuns: false,
    firstRunRatio: null,
  });

  it("needs two samples per side", () => {
    expect(judge(s(1, 0.1, 1), s(2, 0.1, 10))).toBe("inconclusive");
  });

  it("treats zero variance with a real difference as significant, and identical as inconclusive", () => {
    expect(judge(s(1, 0, 5), s(2, 0, 5))).toBe("slower");
    expect(judge(s(1, 0, 5), s(1, 0, 5))).toBe("inconclusive");
  });
});
