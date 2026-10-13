import { describe, expect, it } from "vitest";
import { Latest } from "./latest";

describe("Latest", () => {
  it("treats a lone operation as current", () => {
    expect(new Latest().begin()()).toBe(true);
  });

  it("makes an earlier operation stale as soon as a later one begins", () => {
    const latest = new Latest();
    const first = latest.begin();
    const second = latest.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("only the last of many overlapping operations is current", () => {
    const latest = new Latest();
    const tickets = Array.from({ length: 5 }, () => latest.begin());
    expect(tickets.map((t) => t())).toEqual([false, false, false, false, true]);
  });

  it("an operation stays stale even when a newer one has already finished", () => {
    const latest = new Latest();
    const slow = latest.begin();
    const fast = latest.begin();
    expect(fast()).toBe(true);
    expect(slow()).toBe(false);
    // starting another does not revive the old one
    latest.begin();
    expect(slow()).toBe(false);
  });

  it("separate instances do not affect each other", () => {
    const a = new Latest();
    const b = new Latest();
    const ticketA = a.begin();
    b.begin();
    b.begin();
    expect(ticketA()).toBe(true);
  });
});
