import { exportFileName } from "../file-export.service";

/**
 * The charts are styled with component CSS and theme variables, which a saved file cannot see.
 * Each of these is copied from the computed style onto the element before the SVG is saved.
 */
export const INLINED_STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
  "font-family",
  "font-size",
  "font-variant-numeric",
  "text-anchor",
  "opacity",
];

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface SvgDocumentParts {
  /** Markup of the chart's children, already carrying inline styles. */
  body: string;
  width: number;
  height: number;
  /** A resolved colour, not a variable: the file has no stylesheet. */
  background: string;
  title: string;
  description: string;
}

export function buildSvgDocument(parts: SvgDocumentParts): string {
  const { body, width, height, background, title, description } = parts;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">` +
    `<title>${escapeXml(title)}</title><desc>${escapeXml(description)}</desc>` +
    `<rect width="${width}" height="${height}" fill="${escapeXml(background)}"/>` +
    body +
    `</svg>`
  );
}

export const chartFileName = (title: string, ext: "svg" | "png", date = new Date()): string =>
  exportFileName(title, ext, date);
