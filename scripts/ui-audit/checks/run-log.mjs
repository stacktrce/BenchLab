import { openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes } from "../wait.mjs";

/** Logs are shown as text: markup in a log must not become elements, and search marks matches. */
export async function auditRunLog(browser) {
  const page = await openPage(browser, "/runs/r2");
  await page.waitForSelector("#run-log details");
  await page.evaluate(() => document.querySelectorAll("#run-log details").forEach((d) => (d.open = true)));

  const shownAsText = await page.evaluate(() => document.querySelector("#run-log").textContent.includes("<img src=x"));
  const injected = await page.evaluate(() => document.querySelectorAll("#run-log img").length > 0 || window.__xss === true);
  check(shownAsText && !injected, "markup in a log is shown as text, never as HTML");

  const truncated = await page.evaluate(() => document.querySelector("#run-log").textContent.includes("log truncated"));
  check(truncated, "a log cut at a cap says so");

  await page.type("#run-log input[type=search]", "benchmark");
  const marked = await becomes(() => page.evaluate(() => document.querySelectorAll("#run-log mark").length === 4), {
    message: "the matches to be marked",
  });
  check(marked, "searching marks every match, ignoring case (4 cases, 4 matches)");
  await page.close();
}
