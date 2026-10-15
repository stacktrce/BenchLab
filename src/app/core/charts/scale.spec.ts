import { describe, expect, it } from "vitest";
import { formatInUnit, pickUnit } from "./scale";

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
