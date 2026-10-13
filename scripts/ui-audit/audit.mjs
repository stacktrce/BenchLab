// UI audit: renders every screen in headless Chrome or Edge, in both colour schemes, with a
// mocked Tauri bridge. Checks:
//   1. axe-core (WCAG 2 A/AA, 2.1 A/AA and best practices) reports no violations
//   2. keyboard behaviour: shortcuts, dialog focus handling, a visible focus ring on every tab stop
// and optionally writes a screenshot of each screen.
//
//   npm run audit:ui                       # starts the dev server itself if it is not running
//   npm run audit:ui -- --shots docs/tmp   # also write PNGs
//   CHROME_PATH=/path/to/chrome npm run audit:ui
//
// Exit code is 1 when any check fails.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { tauriMock } from "./mock-tauri.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "http://localhost:1420";
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const shotsDir = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/microsoft-edge",
];

function findBrowser() {
  const found = BROWSER_CANDIDATES.find((p) => p && existsSync(p));
  if (!found) throw new Error("No Chrome or Edge found. Set CHROME_PATH to a browser executable.");
  return found;
}

async function serverIsUp() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

/** Starts `npm run start` unless something already answers on the dev port. */
async function ensureServer() {
  if (await serverIsUp()) return null;
  console.log("Starting the dev server…");
  // detached gives the child its own process group on Unix so the whole tree can be stopped.
  const child = spawn("npm", ["run", "start"], { cwd: root, shell: true, stdio: "ignore", detached: process.platform !== "win32" });
  for (let i = 0; i < 90; i++) {
    if (await serverIsUp()) return child;
    await new Promise((r) => setTimeout(r, 1000));
  }
  stopServer(child);
  throw new Error("The dev server did not come up within 90 seconds.");
}

/** `child.kill()` would only stop the shell; npm and ng serve live below it. */
function stopServer(child) {
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  else process.kill(-child.pid, "SIGTERM");
}

const clickByText = (text, selector = "button") => (page) =>
  page.evaluate(
    (t, s) => [...document.querySelectorAll(s)].find((el) => el.textContent.trim().startsWith(t)).click(),
    text,
    selector,
  );

/** name, route, optional action to reach the state, optional empty-data flag */
const SCREENS = [
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
      await new Promise((r) => setTimeout(r, 300));
    },
  ],
];

let failures = 0;
function check(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures++;
}

async function openPage(browser, route, { scheme = "light", empty = false, slow = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 720 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.evaluateOnNewDocument(tauriMock, { empty, slow });
  await page.goto(BASE + route, { waitUntil: "networkidle0" });
  return page;
}

async function auditAxe(browser) {
  for (const scheme of ["light", "dark"]) {
    for (const [name, route, act, empty] of SCREENS) {
      const page = await openPage(browser, route, { scheme, empty: !!empty });
      if (act) await act(page);
      await new Promise((r) => setTimeout(r, 250));
      await page.evaluate(AXE_SOURCE);
      const { violations } = await page.evaluate(() =>
        // eslint-disable-next-line no-undef
        axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }),
      );
      check(violations.length === 0, `axe ${scheme}/${name}`);
      for (const v of violations) {
        console.log(`        ${v.impact} ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`          ${n.target.join(" ")}`);
      }
      if (shotsDir) {
        mkdirSync(shotsDir, { recursive: true });
        await page.screenshot({ path: join(shotsDir, `${scheme}-${name}.png`) });
      }
      await page.close();
    }
  }
}

const activeElement = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el.tagName,
      text: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30),
      inModal: !!el.closest(".modal"),
    };
  });

async function auditDialogKeyboard(browser) {
  const page = await openPage(browser, "/suites/s1");

  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
  const opened = await page.waitForSelector(".modal", { timeout: 2000 }).then(() => true, () => false);
  check(opened, "Ctrl+Enter opens the run dialog");
  let focus = await activeElement(page);
  check(focus.inModal && focus.text === "Run", `the dialog focuses its Run button first (got "${focus.text}")`);

  for (const [label, shift] of [["Tab", false], ["Shift+Tab", true]]) {
    const escaped = [];
    for (let i = 0; i < 8; i++) {
      if (shift) await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      if (shift) await page.keyboard.up("Shift");
      focus = await activeElement(page);
      if (!focus.inModal) escaped.push(`${label} #${i + 1} -> ${focus.text}`);
    }
    check(escaped.length === 0, `${label} stays inside the dialog ${escaped.join(", ")}`);
  }

  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 200));
  check(!(await page.$(".modal")), "Escape closes the dialog");

  // Opened from a focused button, focus must come back to it.
  await page.evaluate(() => [...document.querySelectorAll(".page-bar button")].find((b) => b.textContent.trim() === "Run").focus());
  await page.keyboard.press("Enter");
  await page.waitForSelector(".modal", { timeout: 2000 });
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 200));
  focus = await activeElement(page);
  check(!focus.inModal && focus.text === "Run", `focus returns to the opener (got ${focus.tag} "${focus.text}")`);

  // The mocked backend rejects save_suite_cmd, which shows up in the page as an error note.
  await page.keyboard.down("Control");
  await page.keyboard.press("s");
  await page.keyboard.up("Control");
  await new Promise((r) => setTimeout(r, 300));
  check(await page.evaluate(() => document.body.innerText.includes("mock: save_suite_cmd")), "Ctrl+S reaches the save handler");
  await page.close();
}

/** Tabs through a fresh page until focus wraps; every stop needs an outline and none may be skipped. */
async function auditTabOrder(browser) {
  for (const route of ["/suites/s1", "/compare?candidate=r2&baseline=r1", "/runs/r2", "/quick"]) {
    const page = await openPage(browser, route);
    // Controls inside a collapsed <details> are correctly not tabbable.
    const expected = await page.evaluate(
      () =>
        [...document.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, summary, [tabindex='0']")].filter(
          (el) => el.offsetParent !== null && !(el.closest("details") && !el.closest("details").open && el.tagName !== "SUMMARY"),
        ).length,
    );
    const withoutRing = [];
    let stops = 0;
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el.dataset.visited) return null;
        el.dataset.visited = "1";
        const style = getComputedStyle(el);
        const name = `${el.tagName}:${el.getAttribute("aria-label") || el.id || el.textContent.trim().slice(0, 24)}`;
        return { name, ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 };
      });
      if (!stop) break;
      stops++;
      if (!stop.ring) withoutRing.push(stop.name);
    }
    check(
      stops === expected && withoutRing.length === 0,
      `${route}: ${stops} of ${expected} controls reachable by Tab; without focus ring: ${withoutRing.join(" ; ") || "none"}`,
    );
    await page.close();
  }
}

/** In-app navigation without a reload: the Angular router listens for popstate. */
const navigateInApp = (page, url) =>
  page.evaluate((u) => {
    history.pushState({}, "", u);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, url);

/**
 * Open something slow, then something fast before the first answer arrives. The page must show
 * what the URL says, not whichever response happened to land last.
 */
async function auditOverlappingLoads(browser) {
  const editor = await openPage(browser, "/quick", { slow: true });
  await navigateInApp(editor, "/suites/s1"); // answers after 800 ms
  await new Promise((r) => setTimeout(r, 250)); // the page exists and its request is in flight
  await navigateInApp(editor, "/suites/s2"); // answers at once
  await new Promise((r) => setTimeout(r, 1500));
  const title = await editor.$eval("input.title", (el) => el.value).catch(() => "(no title field)");
  check(title === "Second suite", `suite page shows the suite in the URL after a slow response arrives late (shows "${title}")`);
  await editor.close();

  const detail = await openPage(browser, "/quick", { slow: true });
  await navigateInApp(detail, "/runs/r1"); // answers after 800 ms
  await new Promise((r) => setTimeout(r, 250));
  await navigateInApp(detail, "/runs/r2"); // answers at once
  await new Promise((r) => setTimeout(r, 1500));
  const heading = await detail.$eval("h1", (el) => el.textContent.trim()).catch(() => "(no heading)");
  check(heading.startsWith("Oct 13"), `run page shows the run in the URL after a slow response arrives late (shows "${heading}")`);
  await detail.close();
}

/**
 * A run keeps going when you leave the page that started it. The app must still show it,
 * let you cancel it from anywhere, and not drag you back to its results when it ends.
 */
async function auditRunVisibility(browser) {
  const page = await openPage(browser, "/suites/s1");
  await page.evaluate(() => [...document.querySelectorAll(".page-bar button")].find((b) => b.textContent.trim() === "Run").click());
  await page.waitForSelector(".modal .run");
  await page.click(".modal .run");
  await new Promise((r) => setTimeout(r, 300));
  await navigateInApp(page, "/quick");
  await new Promise((r) => setTimeout(r, 400));

  check(!!(await page.$("nav .active-run")), "a running benchmark is shown in the sidebar after leaving its page");
  const cancel = await page.$("nav .active-run button");
  check(!!cancel, "it can be cancelled from the sidebar");
  if (cancel) {
    await cancel.click();
    await new Promise((r) => setTimeout(r, 600));
    check(!(await page.$("nav .active-run")), "the indicator goes away once the run ends");
    check(await page.evaluate(() => location.pathname === "/quick"), "finishing does not pull you away from the page you are on");
  }
  await page.close();
}

const server = await ensureServer();
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
try {
  await auditAxe(browser);
  await auditDialogKeyboard(browser);
  await auditTabOrder(browser);
  await auditOverlappingLoads(browser);
  await auditRunVisibility(browser);
} finally {
  await browser.close();
  if (server) stopServer(server);
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
