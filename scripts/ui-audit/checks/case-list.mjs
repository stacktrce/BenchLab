import { openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes } from "../wait.mjs";

const caseNames = (page) => page.$$eval(".case .case-name", (inputs) => inputs.map((i) => i.value));

/**
 * The case list is its own OnPush component editing the page's FormArray. Adding, moving and
 * removing must show up at once and mark the suite as having unsaved changes.
 */
export async function auditCaseList(browser) {
  const page = await openPage(browser, "/suites/s1");
  await page.waitForSelector(".case .case-name");
  check((await caseNames(page)).length === 4, "the suite's four cases are listed");

  await page.click('.case button[aria-label="Move down"]');
  const moved = await becomes(async () => (await caseNames(page))[1] === "concat with +=", { message: "the case to move" });
  check(moved, `Move down swaps the first two cases (now ${(await caseNames(page)).slice(0, 2).join(", ")})`);

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Add case").click());
  check(await becomes(async () => (await caseNames(page)).length === 5, { message: "a fifth case" }), "Add case adds an empty case");

  await page.click('.case:last-child button[aria-label="Remove case"]');
  check(await becomes(async () => (await caseNames(page)).length === 4, { message: "the case to go" }), "Remove case removes it");

  const dirty = await page.evaluate(() => document.body.innerText.includes("Unsaved changes"));
  check(dirty, "editing the list marks the suite as unsaved");
  await page.close();
}
