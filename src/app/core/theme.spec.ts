import { describe, expect, it } from "vitest";
import { effectiveTheme, toggledTheme } from "./theme";

describe("effectiveTheme", () => {
  it("follows the system only when no theme was chosen", () => {
    expect(effectiveTheme("system", true)).toBe("dark");
    expect(effectiveTheme("system", false)).toBe("light");
    expect(effectiveTheme("light", true)).toBe("light");
    expect(effectiveTheme("dark", false)).toBe("dark");
  });
});

describe("toggledTheme", () => {
  it("always changes what is on screen, starting from the system theme", () => {
    expect(toggledTheme("system", false)).toBe("dark");
    expect(toggledTheme("system", true)).toBe("light");
    expect(toggledTheme("light", false)).toBe("dark");
    expect(toggledTheme("dark", false)).toBe("light");
  });
});
