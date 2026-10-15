/** An accent: the Run button, focus rings, the active tab and the candidate in charts. */
export interface Accent {
  id: string;
  name: string;
  light: { fill: string; ink: string };
  dark: { fill: string; ink: string };
}

/** Page background per theme, from styles.scss, for the contrast checks in the spec. */
export const PAGE_BACKGROUND = { light: "#fbfaf7", dark: "#161615" } as const;

export const DEFAULT_ACCENT = "orange";

/**
 * The first is the stylesheet's own accent. Green and red are left out on purpose: they mean
 * "faster" and "slower" in comparisons.
 */
export const ACCENTS: Accent[] = [
  { id: "orange", name: "Burnt orange", light: { fill: "#c2410c", ink: "#ffffff" }, dark: { fill: "#ff8a4c", ink: "#1a0d03" } },
  { id: "blue", name: "Blue", light: { fill: "#1d4ed8", ink: "#ffffff" }, dark: { fill: "#7aa2ff", ink: "#0b1020" } },
  { id: "violet", name: "Violet", light: { fill: "#6d28d9", ink: "#ffffff" }, dark: { fill: "#b69cff", ink: "#140b2b" } },
  { id: "graphite", name: "Graphite", light: { fill: "#3f3f46", ink: "#ffffff" }, dark: { fill: "#d4d4d8", ink: "#18181b" } },
];

/** CSS variables to set on the root for `accentId`; empty for the default, which styles.scss has. */
export function accentVars(accentId: string, theme: "light" | "dark"): Record<string, string> {
  const accent = ACCENTS.find((a) => a.id === accentId);
  if (!accent || accent.id === DEFAULT_ACCENT) return {};
  const { fill, ink } = accent[theme];
  return { "--accent": fill, "--focus": fill, "--accent-ink": ink };
}

export const ACCENT_VARIABLES = ["--accent", "--focus", "--accent-ink"];

/** Whole-window zoom, as Ctrl and + would do in a browser. */
export const TEXT_SIZES = [
  { id: "normal", name: "Normal", zoom: 1 },
  { id: "large", name: "Large", zoom: 1.12 },
  { id: "larger", name: "Larger", zoom: 1.25 },
];

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG 2 contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
