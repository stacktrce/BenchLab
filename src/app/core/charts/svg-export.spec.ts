import { describe, expect, it } from "vitest";
import { buildSvgDocument, chartFileName, escapeXml, INLINED_STYLE_PROPERTIES } from "./svg-export";

describe("escapeXml", () => {
  it("neutralises markup so a case name cannot inject elements or attributes", () => {
    expect(escapeXml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &apos;y&apos;",
    );
  });
});

describe("buildSvgDocument", () => {
  const doc = buildSvgDocument({
    body: `<rect width="1" height="1"/>`,
    width: 720,
    height: 240,
    background: "#fbfaf7",
    title: `Mean <time> of "a & b"`,
    description: "Mean over 3 runs.",
  });

  it("is a standalone SVG with namespace, size and viewBox", () => {
    expect(doc).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(doc).toContain('viewBox="0 0 720 240"');
    expect(doc).toContain('width="720"');
  });

  it("paints the background first so the image reads the same in a dark viewer", () => {
    expect(doc.indexOf('fill="#fbfaf7"')).toBeLessThan(doc.indexOf("<rect width=\"1\""));
  });

  it("carries an escaped title and description for accessibility", () => {
    expect(doc).toContain("<title>Mean &lt;time&gt; of &quot;a &amp; b&quot;</title>");
    expect(doc).toContain("<desc>Mean over 3 runs.</desc>");
    expect(doc).not.toContain("<time>");
  });
});

describe("INLINED_STYLE_PROPERTIES", () => {
  it("covers what the charts style through CSS, so an exported file does not lose its look", () => {
    for (const property of ["fill", "stroke", "stroke-width", "stroke-dasharray", "font-family", "font-size", "text-anchor"]) {
      expect(INLINED_STYLE_PROPERTIES).toContain(property);
    }
  });
});

describe("chartFileName", () => {
  it("makes a safe, dated file name", () => {
    const name = chartFileName("Mean time per run: concat with +=", "svg", new Date("2026-10-13T10:00:00Z"));
    expect(name).toBe("mean-time-per-run-concat-with-2026-10-13.svg");
  });

  it("falls back when the title has no usable characters", () => {
    expect(chartFileName("???", "png", new Date("2026-10-13T10:00:00Z"))).toBe("benchlab-2026-10-13.png");
  });
});
