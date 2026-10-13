import { clickByText, commandCalled } from "./browser.mjs";
import { waitFor } from "./wait.mjs";

/** name, route, optional action to reach the state, optional empty-data flag */
export const SCREENS = [
  ["quick-empty", "/quick", null, true],
  ["quick", "/quick"],
  ["new-suite", "/suites/new"],
  ["suite", "/suites/s1"],
  ["suite-hooks", "/suites/s1", (p) => p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)))],
  ["history", "/suites/s1", clickByText("History", "[role=tab]")],
  ["run", "/runs/r2"],
  ["compare", "/compare?candidate=r2&baseline=r1"],
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
