import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, parseFilter, serializeFilter, toRunFilter } from "./history-filters";

describe("history filters in the URL", () => {
  it("round-trips a full filter", () => {
    const state = { text: "main", suiteId: "s1", status: "failed" as const, from: "2026-10-01", to: "2026-10-05", tag: "ci", page: 3 };
    expect(parseFilter(serializeFilter(state))).toEqual(state);
  });

  it("leaves empty values and the first page out of the URL", () => {
    expect(serializeFilter(EMPTY_FILTER)).toEqual({});
    expect(serializeFilter({ ...EMPTY_FILTER, text: "  " })).toEqual({});
  });

  it("ignores unknown statuses, bad dates and a bad page", () => {
    expect(parseFilter({ status: "exploded", from: "yesterday", to: "2026-13-45", page: "-2", junk: "x" })).toEqual(EMPTY_FILTER);
    expect(parseFilter({ page: "abc" }).page).toBe(1);
    expect(parseFilter({ page: "2.5" }).page).toBe(1);
  });

  it("drops the page from what the backend gets", () => {
    expect(toRunFilter({ ...EMPTY_FILTER, text: " fast ", page: 4 })).toEqual({
      suiteId: null, status: null, from: null, to: null, text: "fast", tag: null,
    });
  });
});
