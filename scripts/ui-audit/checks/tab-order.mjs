import { openPage } from "../browser.mjs";
import { check } from "../report.mjs";

/** Tabs through a fresh page until focus wraps; every stop needs an outline and none may be skipped. */
export async function auditTabOrder(browser) {
  for (const route of ["/suites/s1", "/compare?candidate=r2&baseline=r1", "/runs/r2", "/quick"]) {
    const page = await openPage(browser, route);
    // Controls inside a collapsed <details> are correctly not tabbable.
    const expected = await page.evaluate(
      () =>
        [...document.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, summary, [tabindex='0']")].filter(
          (el) => el.offsetParent !== null && !(el.closest("details") && !el.closest("details").open && el.tagName !== "SUMMARY"),
        ).length,
    );
    const withoutRing = [];
    let stops = 0;
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el.dataset.visited) return null;
        el.dataset.visited = "1";
        const style = getComputedStyle(el);
        const name = `${el.tagName}:${el.getAttribute("aria-label") || el.id || el.textContent.trim().slice(0, 24)}`;
        return { name, ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 };
      });
      if (!stop) break;
      stops++;
      if (!stop.ring) withoutRing.push(stop.name);
    }
    check(
      stops === expected && withoutRing.length === 0,
      `${route}: ${stops} of ${expected} controls reachable by Tab; without focus ring: ${withoutRing.join(" ; ") || "none"}`,
    );
    await page.close();
  }
}
