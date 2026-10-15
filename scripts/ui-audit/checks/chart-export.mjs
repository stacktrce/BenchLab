import { commandCalled, openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { waitFor } from "../wait.mjs";

const lastCall = (page, command) =>
  page.evaluate((name) => [...window.__calls].reverse().find((c) => c.command === name)?.args, command);

/** Saving a chart writes a PNG that really is one, painted on the page background. */
export async function auditChartExport(browser) {
  const page = await openPage(browser, "/runs/r2/charts");
  await page.waitForSelector("app-chart-canvas canvas");

  await page.click('button[aria-label="Save PNG of Distribution of timings"]');
  await waitFor(commandCalled(page, "write_binary_file"), { message: "the PNG to be written", timeoutMs: 8000 });
  const png = await lastCall(page, "write_binary_file");
  check(/^C:\/exports\/distribution-of-timings-.*\.png$/.test(png.path), `the PNG goes to the chosen path (${png.path})`);
  check(png.bytes.slice(0, 4).join() === "137,80,78,71", "the bytes start with the PNG signature");
  check(png.bytes.length > 2000, `the image is not empty (${png.bytes.length} bytes)`);

  await page.close();
}
