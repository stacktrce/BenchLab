import { clickByText, commandCalled, openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes, waitFor } from "../wait.mjs";

const rowCount = (page) => page.$$eval("tbody tr", (rows) => rows.length);
const pathAndQuery = (page) => page.evaluate(() => location.pathname + location.search);

/** History: filters go to the URL, two runs open a comparison, notes save, delete asks first. */
export async function auditHistory(browser) {
  const page = await openPage(browser, "/history");
  await page.waitForSelector("tbody tr");
  check((await rowCount(page)) === 3, "every run is listed");

  await page.type("input[type=search]", "perf");
  const filtered = await becomes(async () => (await pathAndQuery(page)).includes("text=perf") && (await rowCount(page)) === 2, {
    message: "the search to apply",
  });
  check(filtered, `the search narrows the list and lands in the URL (${await pathAndQuery(page)})`);

  await page.goto(`${new URL(page.url()).origin}/history`, { waitUntil: "networkidle0" });
  await page.waitForSelector("tbody tr");
  const boxes = await page.$$("tbody input[type=checkbox]");
  await boxes[1].click();
  await boxes[2].click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll(".row-actions button")].find((b) => b.textContent.trim() === "Compare");
    return button && !button.disabled;
  });
  await clickByText("Compare")(page);
  const compared = await becomes(async () => (await pathAndQuery(page)).startsWith("/compare"), { message: "the comparison" });
  const url = await pathAndQuery(page);
  check(compared && url.includes("baseline=r1") && url.includes("candidate=r2"), `two runs compare oldest as baseline (${url})`);

  await page.goto(`${new URL(page.url()).origin}/history`, { waitUntil: "networkidle0" });
  await page.waitForSelector("tbody tr");
  await clickByText("Add a note")(page);
  await page.waitForSelector("tbody textarea");
  await page.type("tbody textarea", "Thermals checked");
  await clickByText("Save")(page);
  await waitFor(commandCalled(page, "set_run_meta"), { message: "the note to be saved" });
  const noted = await becomes(() => page.evaluate(() => document.body.innerText.includes("Thermals checked")), {
    message: "the note to show",
  });
  check(noted, "a note is saved and shown in its row");

  await (await page.$$("tbody input[type=checkbox]"))[0].click();
  await page.waitForSelector(".row-actions button");
  await clickByText("Delete", ".row-actions button")(page);
  const asks = await becomes(() => page.evaluate(() => document.body.innerText.includes("Delete 1 run for good")), {
    message: "the delete confirmation",
  });
  check(asks && !(await commandCalled(page, "delete_runs")()), "delete asks first, naming the count, and deletes nothing yet");

  // Typing a search and leaving at once must not rewrite the next page's URL when the delay ends.
  await page.goto(`${new URL(page.url()).origin}/history`, { waitUntil: "networkidle0" });
  await page.waitForSelector("tbody tr");
  await page.type("input[type=search]", "main");
  await page.evaluate(() => {
    history.pushState({}, "", "/compare?candidate=r2&baseline=r1");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
  const kept = await pathAndQuery(page);
  check(kept === "/compare?candidate=r2&baseline=r1", `leaving during a search keeps the next page's URL (${kept})`);

  // A page past the end (after deletes, or from an old link) goes to the last page instead of
  // claiming there are no runs.
  await page.goto(`${new URL(page.url()).origin}/history?page=9`, { waitUntil: "networkidle0" });
  const clamped = await becomes(async () => (await pathAndQuery(page)) === "/history" && (await rowCount(page)) === 3, {
    message: "the page to move back",
  });
  check(clamped, `a page past the end moves to the last page (${await pathAndQuery(page)})`);
  await page.close();
}
