import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { openPage, settle } from "../browser.mjs";
import { check } from "../report.mjs";
import { SCREENS } from "../screens.mjs";

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

/** Every screen, both themes: axe-core must report nothing. Optionally writes a screenshot of each. */
export async function auditAxe(browser, { shotsDir } = {}) {
  for (const scheme of ["light", "dark"]) {
    for (const [name, route, act, empty] of SCREENS) {
      const page = await openPage(browser, route, { scheme, empty: !!empty });
      if (act) await act(page);
      await settle(page);
      await page.evaluate(AXE_SOURCE);
      const { violations } = await page.evaluate((tags) => axe.run(document, { runOnly: { type: "tag", values: tags } }), AXE_TAGS);
      check(violations.length === 0, `axe ${scheme}/${name}`);
      for (const v of violations) {
        console.log(`        ${v.impact} ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`          ${n.target.join(" ")}`);
      }
      if (shotsDir) {
        mkdirSync(shotsDir, { recursive: true });
        await page.screenshot({ path: join(shotsDir, `${scheme}-${name}.png`) });
      }
      await page.close();
    }
  }
}
