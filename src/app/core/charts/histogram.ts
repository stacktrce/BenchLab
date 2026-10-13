export interface Histogram {
  /** One more than `counts`. A histogram of identical values is [v, v] with a single count. */
  edges: number[];
  counts: number[];
}

const MIN_BINS = 5;

function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * Freedman-Diaconis bin width (2 * IQR * n^(-1/3)), with Sturges' rule when the IQR is zero,
 * kept between MIN_BINS and `maxBins` (the maximum wins when it is smaller than the minimum).
 */
function binCount(sorted: number[], maxBins: number): number {
  const n = sorted.length;
  const range = sorted[n - 1] - sorted[0];
  if (n < 2 || range === 0) return 1;
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const width = 2 * iqr * Math.cbrt(1 / n);
  const wanted = width > 0 ? Math.ceil(range / width) : Math.ceil(Math.log2(n)) + 1;
  return Math.min(maxBins, Math.max(MIN_BINS, wanted));
}

function edgesFor(sorted: number[], maxBins: number): number[] {
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const bins = binCount(sorted, maxBins);
  if (bins === 1) return [min, min];
  const width = (max - min) / bins;
  const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * width);
  edges[bins] = max;
  return edges;
}

function bucket(edges: number[], values: number[]): number[] {
  const bins = edges.length - 1;
  const counts = new Array<number>(bins).fill(0);
  if (bins === 1) {
    counts[0] = values.length;
    return counts;
  }
  const min = edges[0];
  const width = (edges[bins] - min) / bins;
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - min) / width))]++;
  return counts;
}

const sortedCopy = (values: number[]) => [...values].sort((a, b) => a - b);

export function histogram(values: number[], maxBins = 30): Histogram {
  if (values.length === 0) return { edges: [], counts: [] };
  const edges = edgesFor(sortedCopy(values), maxBins);
  return { edges, counts: bucket(edges, values) };
}

/** Histograms of several sets over the same edges, so they can be drawn on top of each other. */
export function sharedHistograms(sets: number[][], maxBins = 30): Histogram[] {
  const all = sortedCopy(sets.flat());
  if (all.length === 0) return sets.map(() => ({ edges: [], counts: [] }));
  const edges = edgesFor(all, maxBins);
  return sets.map((values) => ({ edges, counts: bucket(edges, values) }));
}
