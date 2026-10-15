import type { ChartConfiguration, ScaleOptions } from "chart.js";
import { ChartPalette, Tone } from "./palette";
import { formatInUnit, pickUnit, TimeUnit } from "./scale";

export interface DataTable {
  columns: string[];
  rows: string[][];
}

/** A chart ready for Chart.js, with the same content in words and as a table. */
export interface ChartModel<T extends "bar" | "line"> {
  empty: boolean;
  unit: TimeUnit;
  config: ChartConfiguration<T>;
  /** The chart in words, for screen readers. */
  summary: string;
  /** Caveats a reader needs next to the picture. */
  notes: string[];
  table: DataTable;
}

export interface TimingSeries {
  label: string;
  /** Seconds. */
  times: number[];
  tone: Tone;
}

const EMPTY_TABLE: DataTable = { columns: [], rows: [] };

/** Long category labels (commits, bin edges) are thinned instead of rotated into a slant. */
export const UNCROWDED_TICKS = { autoSkip: true, maxRotation: 0, maxTicksLimit: 8 };

export function axis(palette: ChartPalette, title: string, extra: ScaleOptions<"linear"> | object = {}) {
  return {
    title: { display: true, text: title, color: palette.muted, font: { family: palette.font, size: 12 } },
    ticks: { color: palette.muted, font: { family: palette.mono, size: 11 } },
    grid: { color: palette.grid },
    border: { color: palette.grid },
    ...extra,
  };
}

export function baseOptions(palette: ChartPalette, showLegend: boolean) {
  return {
    animation: false as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        labels: { color: palette.ink, font: { family: palette.font, size: 12 }, boxWidth: 12 },
      },
      tooltip: { titleFont: { family: palette.font }, bodyFont: { family: palette.mono } },
    },
  };
}

export function emptyModel<T extends "bar" | "line">(type: T, summary: string): ChartModel<T> {
  return {
    empty: true,
    unit: pickUnit(0),
    config: { type, data: { datasets: [] } } as ChartConfiguration<T>,
    summary,
    notes: [],
    table: EMPTY_TABLE,
  };
}

export const range = (times: number[], unit: TimeUnit) =>
  `${formatInUnit(Math.min(...times), unit)} to ${formatInUnit(Math.max(...times), unit)} ${unit.unit}`;
