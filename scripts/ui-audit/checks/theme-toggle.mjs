import { openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes } from "../wait.mjs";

/** One click on the theme button must change the screen, in both directions. */
export async function auditThemeToggle(browser) {
  const page = await openPage(browser, "/quick");
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const toggle = () => page.click('nav button[aria-label^="Switch to the"]');

  const light = await background();
  await toggle();
  const dark = await becomes(async () => (await background()) !== light, { message: "the theme to change" });
  check(dark, "the first click on the theme button changes the theme");

  const darkColour = await background();
  await toggle();
  const back = await becomes(async () => (await background()) !== darkColour, { message: "the theme to change back" });
  check(back && (await background()) === light, "the second click goes back to the first theme");
  await page.close();
}
