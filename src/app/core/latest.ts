/**
 * Lets only the most recent of several overlapping async operations apply its result.
 *
 * A page that loads by route parameter can be asked for suite B while suite A's request is still
 * in flight. If A answers last, its data would overwrite B's page. Each load takes a ticket with
 * `begin()` and checks it after every `await`.
 */
export class Latest {
  private newest = 0;

  /** Starts an operation. The returned function reports whether it is still the newest one. */
  begin(): () => boolean {
    const mine = ++this.newest;
    return () => mine === this.newest;
  }
}
