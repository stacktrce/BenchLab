import { commandCalled, navigateInApp, openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes, waitFor } from "../wait.mjs";

/**
 * A run keeps going when you leave the page that started it. The app must still show it,
 * let you cancel it from anywhere, and not drag you back to its results when it ends.
 */
export async function auditRunVisibility(browser) {
  const page = await openPage(browser, "/suites/s1");
  await page.evaluate(() => [...document.querySelectorAll(".page-bar button")].find((b) => b.textContent.trim() === "Run").click());
  await page.waitForSelector(".modal .run");
  await page.click(".modal .run");
  await waitFor(commandCalled(page, "run_suite"), { message: "the run to start" });
  await navigateInApp(page, "/quick");

  const indicator = () => page.$("nav .active-run");
  const shown = await becomes(async () => !!(await indicator()), { message: "the running indicator in the sidebar" });
  check(shown, "a running benchmark is shown in the sidebar after leaving its page");
  const cancel = await page.$("nav .active-run button");
  check(!!cancel, "it can be cancelled from the sidebar");
  if (cancel) {
    await cancel.click();
    const gone = await becomes(async () => !(await indicator()), { message: "the indicator to go away" });
    check(gone, "the indicator goes away once the run ends");
    check(await page.evaluate(() => location.pathname === "/quick"), "finishing does not pull you away from the page you are on");
  }
  await page.close();
}
