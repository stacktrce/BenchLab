/**
 * Names of the cases a run's error text reports, in order. Each failure line reads
 * `"name": why`. With the run's case names the match is exact, so a quote or colon in a case
 * name or a message cannot confuse it; runs recorded without a configuration snapshot fall back
 * to the text up to the first `": `.
 */
export function failedCaseNames(error: string | null, caseNames: string[] | null): string[] {
  const lines = (error ?? "").split("\n");
  if (caseNames) {
    // The longest name wins: with cases "a" and 'a": b', the line for the second starts with both.
    const longestFirst = [...caseNames].sort((x, y) => y.length - x.length);
    return lines.flatMap((line) => longestFirst.filter((name) => line.startsWith(`"${name}": `)).slice(0, 1));
  }
  return lines.flatMap((line) => {
    const match = /^"(.*?)": /.exec(line);
    return match ? [match[1]] : [];
  });
}
