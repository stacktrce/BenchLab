import { describe, expect, it } from "vitest";
import { ACCENTS, accentVars, contrastRatio, PAGE_BACKGROUND, TEXT_SIZES } from "./appearance";

describe("contrastRatio", () => {
  it("matches the WCAG formula at its ends and for a known pair", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

describe("accent presets", () => {
  for (const accent of ACCENTS) {
    for (const theme of ["light", "dark"] as const) {
      const { fill, ink } = accent[theme];
      it(`${accent.name} (${theme}): button text is readable and the accent stands out from the page`, () => {
        // Text on the Run button: WCAG AA for normal text.
        expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(4.5);
        // Focus rings, chart marks and the active tab against the page.
        expect(contrastRatio(fill, PAGE_BACKGROUND[theme])).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("never offers green or red, which mean faster and slower", () => {
    expect(ACCENTS.map((a) => a.id)).not.toContain("green");
    expect(ACCENTS.map((a) => a.id)).not.toContain("red");
  });

  it("leaves the stylesheet's own accent in place for the default", () => {
    expect(accentVars("orange", "light")).toEqual({});
    expect(accentVars("blue", "dark")).toEqual({ "--accent": "#7aa2ff", "--focus": "#7aa2ff", "--accent-ink": "#0b1020" });
  });

  it("falls back to the default for an unknown id", () => {
    expect(accentVars("plaid", "light")).toEqual({});
  });
});

describe("text sizes", () => {
  it("start at 100% and grow", () => {
    expect(TEXT_SIZES[0].zoom).toBe(1);
    for (let i = 1; i < TEXT_SIZES.length; i++) expect(TEXT_SIZES[i].zoom).toBeGreaterThan(TEXT_SIZES[i - 1].zoom);
  });
});
