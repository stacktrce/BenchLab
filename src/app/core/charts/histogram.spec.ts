import { describe, expect, it } from "vitest";
import { histogram, sharedHistograms } from "./histogram";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ramp = (n: number, from = 0, step = 1) => Array.from({ length: n }, (_, i) => from + i * step);

describe("histogram", () => {
  it("counts every value exactly once", () => {
    const values = ramp(100, 1, 0.37);
    const h = histogram(values);
    expect(sum(h.counts)).toBe(values.length);
    expect(h.edges).toHaveLength(h.counts.length + 1);
  });

  it("includes the maximum value in the last bin", () => {
    const h = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(sum(h.counts)).toBe(11);
    expect(h.counts[h.counts.length - 1]).toBeGreaterThan(0);
    expect(h.edges[h.edges.length - 1]).toBe(10);
  });

  it("puts a value that sits on an edge in exactly one bin", () => {
    const h = histogram([0, 5, 10], 2);
    expect(sum(h.counts)).toBe(3);
  });

  it("is a single bin for one value or for identical values", () => {
    expect(histogram([0.02])).toEqual({ edges: [0.02, 0.02], counts: [1] });
    expect(histogram([0.02, 0.02, 0.02])).toEqual({ edges: [0.02, 0.02], counts: [3] });
  });

  it("is empty for no values", () => {
    expect(histogram([])).toEqual({ edges: [], counts: [] });
  });

  it("never exceeds the maximum number of bins, even for many spread-out values", () => {
    const h = histogram(ramp(10_000, 0, 0.001), 12);
    expect(h.counts.length).toBeLessThanOrEqual(12);
    expect(sum(h.counts)).toBe(10_000);
  });

  it("uses at least a handful of bins for a real spread of values", () => {
    expect(histogram(ramp(200, 0, 0.5)).counts.length).toBeGreaterThanOrEqual(5);
  });

  it("falls back to a sensible bin count when most values are identical", () => {
    const h = histogram([...Array(50).fill(1), 2, 3]);
    expect(h.counts.length).toBeGreaterThan(1);
    expect(sum(h.counts)).toBe(52);
  });

  it("does not depend on the input order and does not modify the input", () => {
    const values = [5, 1, 4, 2, 3, 9, 7, 8, 6, 0];
    const copy = [...values];
    expect(histogram(values)).toEqual(histogram([...values].sort((a, b) => a - b)));
    expect(values).toEqual(copy);
  });
});

describe("sharedHistograms", () => {
  it("uses the same edges for every set so they can be overlaid", () => {
    const a = ramp(20, 10, 1);
    const b = ramp(20, 25, 1);
    const [ha, hb] = sharedHistograms([a, b]);
    expect(ha.edges).toEqual(hb.edges);
    expect(ha.edges[0]).toBe(10);
    expect(ha.edges[ha.edges.length - 1]).toBe(44);
    expect(sum(ha.counts)).toBe(20);
    expect(sum(hb.counts)).toBe(20);
  });

  it("handles an empty set next to a real one", () => {
    const [empty, real] = sharedHistograms([[], [1, 2, 3, 4, 5]]);
    expect(sum(empty.counts)).toBe(0);
    expect(sum(real.counts)).toBe(5);
    expect(empty.edges).toEqual(real.edges);
  });

  it("collapses to one shared bin when every value in every set is the same", () => {
    const [a, b] = sharedHistograms([[3, 3], [3]]);
    expect(a).toEqual({ edges: [3, 3], counts: [2] });
    expect(b).toEqual({ edges: [3, 3], counts: [1] });
  });

  it("returns empty histograms when there is no data at all", () => {
    expect(sharedHistograms([[], []])).toEqual([{ edges: [], counts: [] }, { edges: [], counts: [] }]);
  });
});
