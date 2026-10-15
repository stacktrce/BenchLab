import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { launchBrowser } from "../scripts/ui-audit/browser.mjs";

// Renders branding/icon.svg to a PNG: node branding/render-icon.mjs branding/icon.svg out.png [size]
// Then `npx tauri icon out.png` writes every size into src-tauri/icons.
const [, , input, output, size = "1024"] = process.argv;
const svg = readFileSync(input, "utf8");
const b = await launchBrowser(puppeteer);
const page = await b.newPage();
await page.setViewport({ width: Number(size), height: Number(size) });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
await page.screenshot({ path: output, omitBackground: true, clip: { x: 0, y: 0, width: Number(size), height: Number(size) } });
await b.close();
