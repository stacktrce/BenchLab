import { clickByText, commandCalled } from "./browser.mjs";
import { waitFor } from "./wait.mjs";

/** Picks a case on a chart page and opens every "Show data" table. */
const chartCase = (caseName) => (page) =>
  page.evaluate(async (name) => {
    const picker = document.querySelector("select");
    picker.value = name;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    document.querySelectorAll("details").forEach((d) => (d.open = true));
  }, caseName);

/** name, route, optional action to reach the state, optional empty-data flag */
export const SCREENS = [
  ["quick-empty", "/quick", null, true],
  ["quick", "/quick"],
  ["new-suite", "/suites/new"],
  ["suite", "/suites/s1"],
  ["suite-hooks", "/suites/s1", (p) => p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)))],
  ["history", "/suites/s1", clickByText("History", "[role=tab]")],
  ["trends", "/suites/s1/trends"],
  ["run", "/runs/r2"],
  ["compare", "/compare?candidate=r2&baseline=r1"],
  ["run-charts", "/runs/r2/charts"],
  ["compare-charts", "/compare/charts?candidate=r2&baseline=r1", chartCase("regex split")],
  ["confirm", "/suites/s1", clickByText("Run")],
  [
    "running",
    "/suites/s1",
    async (page) => {
      await clickByText("Run")(page);
      await page.waitForSelector(".modal .run");
      await page.click(".modal .run");
      await waitFor(commandCalled(page, "run_suite"), { message: "the run to start" });
    },
  ],
];
