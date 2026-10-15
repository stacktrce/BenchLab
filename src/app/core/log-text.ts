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
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

export function tailLines(text: string, count: number): string {
  return text.replace(/\s+$/, "").split("\n").slice(-count).join("\n");
}
