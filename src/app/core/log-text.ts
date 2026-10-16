/** CSI sequences (colours, cursor moves), OSC sequences (titles, links) and a lone trailing ESC. */
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b$/g;

/** Terminal escape codes removed for display; the stored log keeps them. */
export const stripAnsi = (text: string): string => text.replace(ANSI, "");

/** The text cut into matching and non-matching runs, so matches can be wrapped without HTML. */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  if (text === "") return [];
  if (query === "") return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  // Searched in the original text: a lowercased copy can be longer ("İ" becomes two code units),
  // and its positions would then point at the wrong place in the original.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  let from = 0;
  for (const found of text.matchAll(pattern)) {
    const at = found.index;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: found[0], match: true });
    from = at + found[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

export function tailLines(text: string, count: number): string {
  return text.replace(/\s+$/, "").split("\n").slice(-count).join("\n");
}
