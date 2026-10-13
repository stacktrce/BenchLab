import { answerDelivered, commandCalled, navigateInApp, openPage, settle } from "../browser.mjs";
import { check } from "../report.mjs";
import { waitFor } from "../wait.mjs";

/**
 * Open something slow, then something fast before the first answer arrives. The page must show
 * what the URL says, not whichever response happened to land last. Each step waits for the event
 * it depends on: the slow request being issued, then its answer being delivered.
 */
async function openSlowThenFast(browser, { slowRoute, slowCall, slowLabel, fastRoute, read }) {
  const page = await openPage(browser, "/quick", { slow: true });
  await navigateInApp(page, slowRoute);
  await waitFor(commandCalled(page, slowCall.command, slowCall.args), { message: `${slowCall.command} to be requested` });
  await navigateInApp(page, fastRoute);
  await waitFor(answerDelivered(page, slowLabel), { timeoutMs: 5000, message: "the slow answer to arrive after the fast one" });
  await settle(page);
  const shown = await read(page);
  await page.close();
  return shown;
}

export async function auditOverlappingLoads(browser) {
  const title = await openSlowThenFast(browser, {
    slowRoute: "/suites/s1",
    slowCall: { command: "get_suite", args: { id: "s1" } },
    slowLabel: "get_suite:s1",
    fastRoute: "/suites/s2",
    read: (page) => page.$eval("input.title", (el) => el.value).catch(() => "(no title field)"),
  });
  check(title === "Second suite", `suite page shows the suite in the URL after a slow response arrives late (shows "${title}")`);

  const heading = await openSlowThenFast(browser, {
    slowRoute: "/runs/r1",
    slowCall: { command: "get_run", args: { id: "r1" } },
    slowLabel: "get_run:r1",
    fastRoute: "/runs/r2",
    read: (page) => page.$eval("h1", (el) => el.textContent.trim()).catch(() => "(no heading)"),
  });
  check(heading.startsWith("Oct 13"), `run page shows the run in the URL after a slow response arrives late (shows "${heading}")`);
}
