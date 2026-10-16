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

  // An impossible default is refused with a reason, and the box shows the saved value again.
  await page.goto(page.url().replace("/suites/s1", "/settings"), { waitUntil: "networkidle0" });
  const runsBox = 'input[type="number"]';
  await page.waitForSelector(runsBox);
  await page.$eval(runsBox, (input) => {
    input.value = "0";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const refused = await becomes(() => page.evaluate(() => document.querySelector("[role=alert]")?.textContent.includes("Timed runs must be")), {
    message: "the refusal",
  });
  const shown = await page.$eval(runsBox, (i) => i.value);
  check(refused && shown === "10", `an invalid default is refused and the box shows the saved value (${shown})`);

  await page.evaluate(() => localStorage.removeItem("benchlab.settings"));
  await page.close();
}
