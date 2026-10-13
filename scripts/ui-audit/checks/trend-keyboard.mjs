import { clickByText, openPage, settle } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes } from "../wait.mjs";

/** The trend plot is one tab stop; arrows read out one run at a time and Enter opens it. */
export async function auditTrendKeyboard(browser) {
  const page = await openPage(browser, "/suites/s1");
  await clickByText("Trends", "[role=tab]")(page);
  await page.waitForSelector(".plot");

  const readout = () => page.$eval(".readout", (el) => el.textContent.trim());
  const newest = await readout();
  await page.focus(".plot");
  await page.keyboard.press("ArrowLeft");
  await settle(page);
  const older = await readout();
  check(older !== newest && older.length > 0, `ArrowLeft reads out an older run (was "${newest}", now "${older}")`);

  await page.keyboard.press("Home");
  await settle(page);
  const first = await readout();
  check(first.includes("baseline"), `Home goes to the oldest run, which is the pinned baseline (got "${first}")`);

  await page.keyboard.press("Enter");
  const opened = await becomes(() => page.evaluate(() => location.pathname === "/runs/r1"), { message: "Enter to open the run" });
  check(opened, "Enter opens the run shown");
  await page.close();
}
