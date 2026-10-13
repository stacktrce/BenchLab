import { describe, expect, it } from "vitest";
import { exportFileName } from "./file-export.service";

describe("exportFileName", () => {
  const d = new Date("2026-03-04T10:00:00Z");

  it("slugifies the suite name and appends the date", () => {
    expect(exportFileName("Demo: string building (sample data)", "md", d)).toBe(
      "demo-string-building-sample-data-2026-03-04.md",
    );
  });

  it("falls back when the name has no usable characters", () => {
    expect(exportFileName("???", "csv", d)).toBe("benchlab-2026-03-04.csv");
  });
});
