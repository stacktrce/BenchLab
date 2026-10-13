import { clickByText, commandCalled } from "./browser.mjs";
import { waitFor } from "./wait.mjs";

/** Scrolls the charts into view, optionally on another case and with every "Show data" table open. */
function showCharts(caseName, openData = false) {
  return (page) =>
    page.evaluate(
      async ([name, open]) => {
        const charts = document.querySelector("app-case-charts");
        const picker = charts.querySelector("select");
        if (name) {
          picker.value = name;
          picker.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 100));
        }
        if (open) charts.querySelectorAll("details").forEach((d) => (d.open = true));
        charts.scrollIntoView();
      },
      [caseName, openData],
    );
}

/** name, route, optional action to reach the state, optional empty-data flag */
export const SCREENS = [
  ["quick-empty", "/quick", null, true],
  ["quick", "/quick"],
  ["new-suite", "/suites/new"],
  ["suite", "/suites/s1"],
  ["suite-hooks", "/suites/s1", (p) => p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)))],
  ["history", "/suites/s1", clickByText("History", "[role=tab]")],
  ["trends", "/suites/s1", clickByText("Trends", "[role=tab]")],
  ["run", "/runs/r2"],
  ["compare", "/compare?candidate=r2&baseline=r1"],
  ["run-charts", "/runs/r2", showCharts()],
  ["compare-charts", "/compare?candidate=r2&baseline=r1", showCharts("regex split", true)],
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
