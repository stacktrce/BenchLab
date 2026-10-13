import { commandCalled, openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { waitFor } from "../wait.mjs";

const lastCall = (page, command) =>
  page.evaluate((name) => [...window.__calls].reverse().find((c) => c.command === name)?.args, command);

/** Saving a chart writes a self-contained SVG, and a PNG that really is one. */
export async function auditChartExport(browser) {
  const page = await openPage(browser, "/runs/r2");
  await page.waitForSelector("app-histogram-chart figure svg");

  await page.click('app-histogram-chart button[aria-label$="as SVG"]');
  await waitFor(commandCalled(page, "write_text_file"), { message: "the SVG to be written" });
  const svg = await lastCall(page, "write_text_file");
  check(/^C:\/exports\/.*\.svg$/.test(svg.path), `the SVG goes to the chosen path (${svg.path})`);
  check(svg.content.startsWith("<svg xmlns="), "the file is a standalone SVG");
  check(!svg.content.includes("var("), "no theme variables are left in it, because a file has no stylesheet");
  check(/<rect[^>]*style="[^"]*fill:\s*rgb/.test(svg.content), "bars carry their computed colours inline");
  check(svg.content.includes("<title>Distribution of timings</title>"), "it has a title for screen readers");

  await page.click('app-histogram-chart button[aria-label$="as PNG"]');
  await waitFor(commandCalled(page, "write_binary_file"), { message: "the PNG to be written", timeoutMs: 8000 });
  const png = await lastCall(page, "write_binary_file");
  check(/\.png$/.test(png.path), `the PNG goes to the chosen path (${png.path})`);
  check(png.bytes.slice(0, 4).join() === "137,80,78,71", "the bytes start with the PNG signature");
  check(png.bytes.length > 2000, `the image is not empty (${png.bytes.length} bytes)`);

  await page.close();
}
