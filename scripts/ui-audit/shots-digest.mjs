// Compares two directories of screenshots byte for byte.
//
//   node scripts/ui-audit/shots-digest.mjs tmp/before tmp/after
//
// A refactor that must not change how anything looks writes screenshots before and after
// (`npm run audit:ui -- --shots <dir>`) and runs this. Exit code 1 when any file differs or
// exists on one side only.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function digests(dir) {
  const result = new Map();
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".png"))) {
    result.set(name, createHash("sha256").update(readFileSync(join(dir, name))).digest("hex"));
  }
  return result;
}

const [dirA, dirB] = process.argv.slice(2);
if (!dirA || !dirB) {
  console.error("usage: node scripts/ui-audit/shots-digest.mjs <dirA> <dirB>");
  process.exit(2);
}

const a = digests(dirA);
const b = digests(dirB);
const names = [...new Set([...a.keys(), ...b.keys()])].sort();
let differing = 0;
for (const name of names) {
  const status = !a.has(name) ? `only in ${dirB}` : !b.has(name) ? `only in ${dirA}` : a.get(name) === b.get(name) ? "same" : "DIFFERENT";
  if (status !== "same") differing++;
  console.log(`${status.padEnd(12)} ${name}`);
}
console.log(differing ? `\n${differing} of ${names.length} differ` : `\nall ${names.length} screenshots identical`);
process.exit(differing ? 1 : 0);
