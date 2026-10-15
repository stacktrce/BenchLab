import { buildSvgDocument, INLINED_STYLE_PROPERTIES } from "../../core/charts/svg-export";

/** PNGs are drawn at this multiple of the SVG's size so they stay sharp in slides and documents. */
const PNG_SCALE = 2;

/** Copies the computed value of each exported property onto the matching element of the clone. */
function inlineStyles(source: Element, copy: Element): void {
  const computed = getComputedStyle(source);
  const style = INLINED_STYLE_PROPERTIES.map((p) => `${p}:${computed.getPropertyValue(p)}`).join(";");
  copy.setAttribute("style", style);
  [...source.children].forEach((child, i) => inlineStyles(child, copy.children[i]));
}

/** A standalone SVG file for the chart on screen, in the colours of the current theme. */
export function chartSvgText(svg: SVGSVGElement, title: string): { text: string; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  const { width, height } = svg.viewBox.baseVal;
  const description = svg.getAttribute("aria-label") ?? "";
  const background = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#ffffff";
  const text = buildSvgDocument({ body: clone.innerHTML, width, height, background, title, description });
  return { text, width, height };
}

export async function chartPngBytes(svg: SVGSVGElement, title: string): Promise<Uint8Array> {
  const { text, width, height } = chartSvgText(svg, title);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width * PNG_SCALE;
    canvas.height = height * PNG_SCALE;
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The browser could not render the chart as an image.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
