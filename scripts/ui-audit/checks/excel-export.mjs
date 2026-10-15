import { clickByText, commandCalled, openPage } from "../browser.mjs";
import { check } from "../report.mjs";
import { waitFor } from "../wait.mjs";

const lastWorkbook = (page) =>
  page.evaluate(() => [...window.__calls].reverse().find((c) => c.command === "write_xlsx_file")?.args);

/** The Excel buttons send a workbook with typed numbers to the writer, for a run and a comparison. */
export async function auditExcelExport(browser) {
  for (const [route, sheets, numberColumn] of [
    ["/runs/r2", ["Results", "Run"], 1],
    ["/compare?candidate=r2&baseline=r1", ["Comparison", "Notes"], 8],
  ]) {
    const page = await openPage(browser, route);
    await page.waitForSelector(".row-actions button");
    await clickByText("Excel")(page);
    await waitFor(commandCalled(page, "write_xlsx_file"), { message: `the workbook from ${route}` });
    const args = await lastWorkbook(page);
    const names = args.workbook.sheets.map((s) => s.name);
    check(args.path.endsWith(".xlsx"), `${route}: the workbook goes to an .xlsx path (${args.path})`);
    check(names.join() === sheets.join(), `${route}: sheets ${names.join(", ")}`);
    const value = args.workbook.sheets[0].rows[0][numberColumn];
    check(typeof value === "number", `${route}: times are numbers, not text (${value})`);
    await page.close();
  }
}
