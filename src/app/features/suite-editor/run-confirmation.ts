import { Suite } from "../../core/models";
import { ConfirmItem } from "../../shared/run-confirm.component";

/** Exactly what the backend will execute: the saved, enabled cases. */
export function confirmItems(suite: Suite | null): ConfirmItem[] {
  return (suite?.cases ?? [])
    .filter((c) => c.enabled)
    .map((c) => ({
      name: c.name,
      command: c.command,
      setupCommand: c.setupCommand,
      cleanupCommand: c.cleanupCommand,
      workingDirectory: c.workingDirectory,
    }));
}

export function confirmSummary(suite: Suite | null): string {
  if (!suite) return "";
  const warm = suite.warmup > 0 ? `, after ${suite.warmup} warm-up run${suite.warmup === 1 ? "" : "s"}` : "";
  return `${confirmItems(suite).length} case(s), ${suite.runs} timed runs each${warm}`;
}
