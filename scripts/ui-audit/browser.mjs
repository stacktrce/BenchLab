import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tauriMock } from "./mock-tauri.mjs";

export const BASE = "http://localhost:1420";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

export function findBrowser() {
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

/** Starts `npm run start` unless something already answers on the dev port. Returns the child, or null. */
export async function ensureServer() {
  if (await serverIsUp()) return null;
  console.log("Starting the dev server…");
  // detached gives the child its own process group on Unix so the whole tree can be stopped.
  const child = spawn("npm", ["run", "start"], { cwd: root, shell: true, stdio: "ignore", detached: process.platform !== "win32" });
  for (let i = 0; i < 90; i++) {
    if (await serverIsUp()) return child;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  stopServer(child);
  throw new Error("The dev server did not come up within 90 seconds.");
}

/** `child.kill()` would only stop the shell; npm and ng serve live below it. */
export function stopServer(child) {
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  else process.kill(-child.pid, "SIGTERM");
}

export async function openPage(browser, route, { scheme = "light", empty = false, slow = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 720 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.evaluateOnNewDocument(tauriMock, { empty, slow });
  await page.goto(BASE + route, { waitUntil: "networkidle0" });
  return page;
}

/** In-app navigation without a reload: the Angular router listens for popstate. */
export const navigateInApp = (page, url) =>
  page.evaluate((u) => {
    history.pushState({}, "", u);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, url);

export const clickByText = (text, selector = "button") => (page) =>
  page.evaluate(
    (t, s) => [...document.querySelectorAll(s)].find((el) => el.textContent.trim().startsWith(t)).click(),
    text,
    selector,
  );

/** Two animation frames: whatever Angular was about to render has been rendered. */
export const settle = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Whether the mocked backend has received `command` with arguments that include everything in `argsSubset`. */
export const commandCalled = (page, command, argsSubset = {}) => () =>
  page.evaluate(
    (name, subset) =>
      window.__calls.some((c) => c.command === name && Object.entries(subset).every(([key, value]) => c.args?.[key] === value)),
    command,
    argsSubset,
  );

/** Whether a delayed mock answer (see `later` in mock-tauri.mjs) has been delivered. */
export const answerDelivered = (page, label) => () => page.evaluate((l) => window.__calls.some((c) => c.command === `delivered:${l}`), label);
