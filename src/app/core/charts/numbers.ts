/** Linear-interpolated quantile of an ascending list. `q` is between 0 and 1; the list must not be empty. */
export function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export const sortedCopy = (values: number[]): number[] => [...values].sort((a, b) => a - b);

export const median = (values: number[]): number => quantile(sortedCopy(values), 0.5);

export const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
