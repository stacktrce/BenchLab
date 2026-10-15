export interface TimeUnit {
  unit: "µs" | "ms" | "s";
  /** Multiply seconds by this to get the unit. */
  factor: number;
}

/** One unit for a whole chart, chosen from its largest value, so labels never mix units. */
export function pickUnit(maxSeconds: number): TimeUnit {
  if (maxSeconds >= 1) return { unit: "s", factor: 1 };
  if (maxSeconds >= 0.001) return { unit: "ms", factor: 1000 };
  return { unit: "µs", factor: 1_000_000 };
}

/** A value in seconds as a number in `unit`: at most three decimals, no trailing zeros, no "-0". */
export function formatInUnit(seconds: number, unit: TimeUnit): string {
  const text = (seconds * unit.factor).toFixed(3).replace(/\.?0+$/, "");
  return text === "-0" || text === "" ? "0" : text;
}
