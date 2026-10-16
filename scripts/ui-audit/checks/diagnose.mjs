import { commandCalled, openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes, waitFor } from "../wait.mjs";

/** "Run once and show output" asks first, runs only after Run is pressed, then shows the output. */
export async function auditDiagnose(browser) {
  const page = await openPage(browser, "/runs/r3");
  await page.waitForSelector("app-diagnose-case button");

  await page.evaluate(() => [...document.querySelectorAll("button.link")].find((b) => b.textContent.includes("Read the log")).click());
  const stayed = await page.evaluate(() => location.pathname === "/runs/r3");
  const scrolled = await becomes(() => page.evaluate(() => (() => { const top = document.getElementById("run-log").getBoundingClientRect().top; return top >= 0 && top < innerHeight; })()), {
    message: "the log to scroll into view",
  });
  check(stayed && scrolled, "Read the log scrolls to the log and stays on the run page");
  await page.click("app-diagnose-case button");
  await page.waitForSelector(".modal .run");
  const dialog = await page.$eval(".modal", (m) => m.textContent);
  check(dialog.includes("node bench/split.js"), "the dialog shows the case's command before anything runs");
  check(!(await commandCalled(page, "diagnose_case")()), "nothing runs while the dialog is open");

  await page.click(".modal .run");
  await waitFor(commandCalled(page, "diagnose_case", { suiteId: "s1", caseName: "regex split" }), {
    message: "the diagnosis to run",
  });
  const shown = await becomes(
    () => page.evaluate(() => document.querySelector("app-diagnose-case pre")?.textContent.includes("Cannot find module")),
    { message: "the output to appear" },
  );
  check(shown, "the case's output is shown after the run");
  await page.close();
}
