/**
 * Theme colours resolved to concrete values. A canvas cannot read CSS variables, so the chart
 * pages read them from the document and rebuild their charts when the theme changes.
 */
export interface ChartPalette {
  ink: string;
  muted: string;
  grid: string;
  accent: string;
  warn: string;
  background: string;
  font: string;
  mono: string;
}

/** Which colour a series is drawn in: the baseline is quiet, the candidate carries the accent. */
export type Tone = "base" | "cand" | "plain";

export const toneColor = (tone: Tone, palette: ChartPalette): string =>
  tone === "cand" ? palette.accent : palette.muted;

/** `#rrggbb` plus an alpha byte; theme colours are written as six-digit hex in styles.scss. */
export const withAlpha = (hex: string, alpha: number): string =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
