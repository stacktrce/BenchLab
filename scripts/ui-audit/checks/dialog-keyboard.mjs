import { openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { becomes } from "../wait.mjs";

const activeElement = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el.tagName,
      text: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30),
      inModal: !!el.closest(".modal"),
    };
  });

const dialogClosed = (page) => () => page.evaluate(() => !document.querySelector(".modal"));

/** The run dialog: opens from the keyboard, traps focus, closes on Escape and gives focus back. */
export async function auditDialogKeyboard(browser) {
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
  check(await becomes(dialogClosed(page), { message: "the dialog to close on Escape" }), "Escape closes the dialog");

  // Opened from a focused button, focus must come back to it.
  await page.evaluate(() => [...document.querySelectorAll(".page-bar button")].find((b) => b.textContent.trim() === "Run").focus());
  await page.keyboard.press("Enter");
  await page.waitForSelector(".modal", { timeout: 2000 });
  await page.keyboard.press("Escape");
  await becomes(dialogClosed(page), { message: "the dialog to close" });
  focus = await activeElement(page);
  check(!focus.inModal && focus.text === "Run", `focus returns to the opener (got ${focus.tag} "${focus.text}")`);

  // The mocked backend rejects save_suite, which shows up in the page as an error note.
  await page.keyboard.down("Control");
  await page.keyboard.press("s");
  await page.keyboard.up("Control");
  const saveReached = await becomes(() => page.evaluate(() => document.body.innerText.includes("mock: save_suite")), {
    message: "Ctrl+S to reach the save handler",
  });
  check(saveReached, "Ctrl+S reaches the save handler");
  await page.close();
}
