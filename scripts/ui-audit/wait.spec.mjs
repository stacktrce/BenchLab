import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { becomes, waitFor } from "./wait.mjs";

describe("waitFor", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves at once when the condition already holds", async () => {
    const predicate = vi.fn(() => true);
    await waitFor(predicate);
    expect(predicate).toHaveBeenCalledTimes(1);
  });

  it("resolves as soon as the condition flips, polling at the interval", async () => {
    let ready = false;
    const predicate = vi.fn(() => ready);
    const done = waitFor(predicate, { intervalMs: 50 });
    await vi.advanceTimersByTimeAsync(120);
    expect(predicate).toHaveBeenCalledTimes(3);
    ready = true;
    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(predicate).toHaveBeenCalledTimes(4);
  });

  it("accepts an async predicate", async () => {
    let calls = 0;
    const done = waitFor(async () => ++calls >= 2, { intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    await done;
    expect(calls).toBe(2);
  });

  it("rejects with the message after the timeout", async () => {
    const done = waitFor(() => false, { timeoutMs: 200, intervalMs: 50, message: "the dialog to close" });
    const caught = done.catch((e) => e);
    await vi.advanceTimersByTimeAsync(300);
    expect((await caught).message).toBe("Timed out after 200 ms waiting for: the dialog to close");
  });

  it("does not swallow an error thrown by the predicate", async () => {
    await expect(
      waitFor(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("becomes", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is true when the condition comes true and false when it never does", async () => {
    let ready = false;
    const yes = becomes(() => ready, { timeoutMs: 500, intervalMs: 50 });
    ready = true;
    await vi.advanceTimersByTimeAsync(50);
    expect(await yes).toBe(true);

    const no = becomes(() => false, { timeoutMs: 200, intervalMs: 50 });
    await vi.advanceTimersByTimeAsync(300);
    expect(await no).toBe(false);
  });
});
