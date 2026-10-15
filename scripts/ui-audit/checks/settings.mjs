import { openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes } from "../wait.mjs";

const runButtonColour = (page) =>
  page.evaluate(() => getComputedStyle(document.querySelector(".page-bar .run")).backgroundColor);

/** An accent chosen in Settings applies at once, everywhere, and survives a restart. */
export async function auditSettings(browser) {
  const page = await openPage(browser, "/settings");
  await page.waitForSelector('input[name="accent"]');
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  const before = await accent();

  const radios = await page.$$('input[name="accent"]');
  await radios[1].click();
  const changed = await becomes(async () => (await accent()) !== before, { message: "the accent to change" });
  check(changed, `choosing an accent changes it at once (${before} to ${await accent()})`);

  const chosen = await accent();
  await page.goto(page.url().replace("/settings", "/suites/s1"), { waitUntil: "networkidle0" });
  await page.waitForSelector(".page-bar .run");
  check((await accent()) === chosen, "the accent is still chosen after a reload");
  const button = await runButtonColour(page);
  check(button !== "rgb(194, 65, 12)", `the Run button uses it (${button})`);

  await page.evaluate(() => localStorage.removeItem("benchlab.settings"));
  await page.close();
}
