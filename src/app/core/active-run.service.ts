import { Injectable, signal } from "@angular/core";

export interface ActiveRun {
  /** What the sidebar shows: a suite name or "Quick run". */
  label: string;
  /** The suite being run, or null for a quick run. */
  suiteId: string | null;
}

/**
 * The benchmark that is running right now, if any. It lives here rather than in a page because a
 * run keeps going when you leave the page that started it, and the app has to keep showing it
 * (and let you cancel it) wherever you are.
 */
@Injectable({ providedIn: "root" })
export class ActiveRunService {
  readonly current = signal<ActiveRun | null>(null);

  /**
   * Marks `run` as active while `work` is pending. Only one benchmark runs at a time, so if one is
   * already active the work is still started (the backend refuses it with a clear message) but
   * must not claim the state or, when it ends, clear another run's.
   */
  async track<T>(run: ActiveRun, work: () => Promise<T>): Promise<T> {
    const owns = this.current() === null;
    if (owns) this.current.set(run);
    try {
      return await work();
    } finally {
      if (owns) this.current.set(null);
    }
  }
}
