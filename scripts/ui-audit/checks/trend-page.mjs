import { openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes } from "../wait.mjs";

/** The trend chart is described in words, and every run in it can be opened from the keyboard. */
export async function auditTrendPage(browser) {
  const page = await openPage(browser, "/suites/s1/trends");
  await page.waitForSelector("app-chart-canvas canvas");

  const label = await page.$eval("app-chart-canvas canvas", (c) => c.getAttribute("aria-label") ?? "");
  check(label.startsWith("Mean over 24 runs"), `the chart has a spoken summary ("${label.slice(0, 40)}…")`);

  await page.$eval("details", (d) => (d.open = true));
  const firstRun = await page.$("details tbody tr a");
  check(!!firstRun, "the data table links each run");
  if (firstRun) {
    await firstRun.focus();
    await page.keyboard.press("Enter");
    const opened = await becomes(() => page.evaluate(() => location.pathname === "/runs/r1"), { message: "the run to open" });
    check(opened, "Enter on a run in the table opens it");
  }
  await page.close();
}
