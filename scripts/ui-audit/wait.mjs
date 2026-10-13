const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls `predicate` until it is true. Rejects after `timeoutMs`, naming what it waited for.
 * A fixed sleep is either too short (flaky) or too long (slow); waiting for the condition is neither.
 */
export async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 50, message = "the condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for: ${message}`);
    await sleep(intervalMs);
  }
}

/** Like `waitFor`, but answers true or false so a check can report a failure instead of throwing. */
export async function becomes(predicate, options) {
  try {
    await waitFor(predicate, options);
    return true;
  } catch {
    return false;
  }
}
