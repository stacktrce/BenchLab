import { describe, expect, it } from "vitest";
import { formatInUnit, linearScale, niceTicks, pickUnit } from "./scale";

describe("niceTicks", () => {
  it("rounds to steps of 1, 2 or 5 times a power of ten and covers the range", () => {
    expect(niceTicks(0, 97)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("works on small numbers without floating-point noise", () => {
    const ticks = niceTicks(0.0123, 0.0456);
    expect(ticks).toEqual([0.01, 0.02, 0.03, 0.04, 0.05]);
    expect(ticks[0]).toBeLessThanOrEqual(0.0123);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(0.0456);
  });

  it("returns one tick for a zero-width range", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it("accepts reversed and negative ranges", () => {
    expect(niceTicks(97, 0)).toEqual(niceTicks(0, 97));
    expect(niceTicks(-10, 10)).toEqual([-10, -5, 0, 5, 10]);
  });

  it("returns nothing for a range that is not finite", () => {
    expect(niceTicks(NaN, 1)).toEqual([]);
    expect(niceTicks(0, Infinity)).toEqual([]);
  });

  it("aims for roughly the requested number of ticks", () => {
    for (const [lo, hi] of [[0, 1], [0, 3.7], [12, 4800], [0.0002, 0.0009]]) {
      const n = niceTicks(lo, hi, 5).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
});

describe("linearScale", () => {
  it("maps the domain onto the range", () => {
    const x = linearScale([0, 10], [0, 100]);
    expect([x(0), x(5), x(10)]).toEqual([0, 50, 100]);
  });

  it("supports a reversed range, as an SVG y axis needs", () => {
    const y = linearScale([0, 10], [200, 0]);
    expect([y(0), y(10), y(2.5)]).toEqual([200, 0, 150]);
  });

  it("does not clamp values outside the domain", () => {
    expect(linearScale([0, 10], [0, 100])(20)).toBe(200);
  });

  it("maps everything to the middle of the range when the domain has no width", () => {
    const x = linearScale([3, 3], [0, 100]);
    expect([x(3), x(99)]).toEqual([50, 50]);
  });
});

describe("pickUnit", () => {
  it("chooses one unit from the largest value", () => {
    expect(pickUnit(2)).toEqual({ unit: "s", factor: 1 });
    expect(pickUnit(0.5)).toEqual({ unit: "ms", factor: 1000 });
    expect(pickUnit(0.001)).toEqual({ unit: "ms", factor: 1000 });
    expect(pickUnit(0.0000042)).toEqual({ unit: "µs", factor: 1_000_000 });
  });

  it("falls back to microseconds for zero or garbage", () => {
    expect(pickUnit(0).unit).toBe("µs");
    expect(pickUnit(NaN).unit).toBe("µs");
  });
});

describe("formatInUnit", () => {
  const ms = pickUnit(0.5);

  it("converts seconds to the unit and trims trailing zeros", () => {
    expect(formatInUnit(0.0123, ms)).toBe("12.3");
    expect(formatInUnit(0.02, ms)).toBe("20");
    expect(formatInUnit(0, ms)).toBe("0");
  });

  it("keeps at most three decimals", () => {
    expect(formatInUnit(0.0123456, ms)).toBe("12.346");
  });

  it("does not print negative zero", () => {
    expect(formatInUnit(-0.00000001, ms)).toBe("0");
  });
});
