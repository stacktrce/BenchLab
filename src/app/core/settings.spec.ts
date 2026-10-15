import { describe, expect, it } from "vitest";
import { cleanSettings, DEFAULT_SETTINGS } from "./settings.service";

describe("cleanSettings", () => {
  it("keeps valid values", () => {
    const s = { accent: "blue", textSize: "large", defaultRuns: 20, defaultWarmup: 0 };
    expect(cleanSettings(s)).toEqual(s);
  });

  it("replaces anything unknown or out of range with the default", () => {
    expect(cleanSettings({ accent: "plaid", textSize: "huge", defaultRuns: 0, defaultWarmup: -1 })).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ defaultRuns: 2.5, defaultWarmup: "3" })).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
