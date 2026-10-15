// UI audit: renders every screen in headless Chrome or Edge, in both colour schemes, with a
// mocked Tauri bridge, and checks accessibility (axe), keyboard behaviour, and two regressions
// that only show up when the app is driven (overlapping loads, a run that outlives its page).
//
//   npm run audit:ui                       # starts the dev server itself if it is not running
//   npm run audit:ui -- --shots tmp/shots  # also write a PNG per screen and theme
//   CHROME_PATH=/path/to/chrome npm run audit:ui
//
// Exit code is 1 when any check fails.
import puppeteer from "puppeteer-core";
import { ensureServer, findBrowser, stopServer } from "./browser.mjs";
import { auditAxe } from "./checks/axe.mjs";
import { auditChartExport } from "./checks/chart-export.mjs";
import { auditDialogKeyboard } from "./checks/dialog-keyboard.mjs";
import { auditOverlappingLoads } from "./checks/overlapping-loads.mjs";
import { auditRunVisibility } from "./checks/run-visibility.mjs";
import { auditTabOrder } from "./checks/tab-order.mjs";
import { auditTrendPage } from "./checks/trend-page.mjs";
import { failureCount } from "./report.mjs";

const shotsDir = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : undefined;

const server = await ensureServer();
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
try {
  await auditAxe(browser, { shotsDir });
  await auditDialogKeyboard(browser);
  await auditTabOrder(browser);
  await auditTrendPage(browser);
  await auditChartExport(browser);
  await auditOverlappingLoads(browser);
  await auditRunVisibility(browser);
} finally {
  await browser.close();
  if (server) stopServer(server);
}

const failures = failureCount();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
