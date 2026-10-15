import { clickByText, commandCalled, openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes, waitFor } from "../wait.mjs";

/** A running suite shows which case it is on, how long it has run and an estimate of what is left. */
export async function auditProgress(browser) {
  const page = await openPage(browser, "/suites/s1");
  await clickByText("Run")(page);
  await page.waitForSelector(".modal .run");
  await page.click(".modal .run");
  await waitFor(commandCalled(page, "run_suite"), { message: "the run to start" });

  const text = (selector) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", selector);
  const onPage = await becomes(async () => (await text(".live")).includes("Case 2 of 4 · array join"), {
    message: "progress on the suite page",
  });
  check(onPage, `the suite page shows the current case ("${(await text(".live")).trim()}")`);
  const sidebar = await text("nav .active-run");
  check(/about \d+:\d\d left/.test(sidebar), "the sidebar shows an estimate of the time left");

  await page.click("nav .active-run button");
  const gone = await becomes(async () => (await text(".live")) === "", { message: "the progress to clear" });
  check(gone, "progress disappears when the run ends");
  await page.close();
}
