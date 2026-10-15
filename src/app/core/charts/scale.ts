/** Rounds `range` to 1, 2, 5 or 10 times a power of ten. `round` picks the nearest, otherwise the next one up. */
function niceNumber(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  const nice = round
    ? fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
    : fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

/** Round-numbered tick values that cover [min, max], about `target` of them. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const [low, high] = min < max ? [min, max] : [max, min];
  const step = niceNumber(niceNumber(high - low, false) / (target - 1), true);
  const first = Math.floor(low / step);
  const last = Math.ceil(high / step);
  const ticks: number[] = [];
  // Whole multiples of the step, rounded to 12 digits, so 0.1 * 3 is 0.3 and not 0.30000000000000004.
  for (let i = first; i <= last; i++) ticks.push(Number((i * step).toPrecision(12)));
  return ticks;
}

/** Linear map from a domain to a range. It does not clamp. A domain with no width maps to the range's middle. */
export function linearScale(domain: [number, number], range: [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (value) => r0 + (value - d0) * k;
}

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
