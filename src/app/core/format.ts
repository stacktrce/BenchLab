/** Display formatting shared by views and exports. Inputs are seconds. */

export function ms(seconds: number | null | undefined, digits = 2): string {
  return seconds == null ? "—" : `${(seconds * 1000).toFixed(digits)} ms`;
}

export function signedMs(seconds: number | null | undefined, digits = 2): string {
  if (seconds == null) return "—";
  return `${seconds > 0 ? "+" : ""}${(seconds * 1000).toFixed(digits)} ms`;
}

export function percent(p: number | null | undefined, digits = 1): string {
  if (p == null) return "—";
  return `${p > 0 ? "+" : ""}${p.toFixed(digits)}%`;
}
