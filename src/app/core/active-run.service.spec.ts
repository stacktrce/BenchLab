import { describe, expect, it } from "vitest";
import { ActiveRunService } from "./active-run.service";

const suiteRun = { label: "API latency", suiteId: "s1" };

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("ActiveRunService", () => {
  it("is active exactly while the work is pending, and passes the result through", async () => {
    const service = new ActiveRunService();
    const work = deferred<string>();
    const tracked = service.track(suiteRun, () => work.promise);
    expect(service.current()).toEqual(suiteRun);
    work.resolve("done");
    await expect(tracked).resolves.toBe("done");
    expect(service.current()).toBeNull();
  });

  it("clears the state and rethrows when the work fails", async () => {
    const service = new ActiveRunService();
    await expect(service.track(suiteRun, () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(service.current()).toBeNull();
  });

  it("a second attempt does not take over, and its end does not clear the first run", async () => {
    const service = new ActiveRunService();
    const first = deferred<void>();
    const firstTracked = service.track(suiteRun, () => first.promise);

    // the backend refuses a parallel run; that rejection must not touch the first run's state
    await expect(
      service.track({ label: "Quick run", suiteId: null }, () => Promise.reject(new Error("already running"))),
    ).rejects.toThrow("already running");
    expect(service.current()).toEqual(suiteRun);

    first.resolve();
    await firstTracked;
    expect(service.current()).toBeNull();
  });

  it("can track again after a run ended", async () => {
    const service = new ActiveRunService();
    await service.track(suiteRun, async () => undefined);
    const next = deferred<void>();
    const tracked = service.track({ label: "Quick run", suiteId: null }, () => next.promise);
    expect(service.current()?.label).toBe("Quick run");
    next.resolve();
    await tracked;
  });
});
