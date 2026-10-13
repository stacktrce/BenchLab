import { inject, Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { ActiveRunService } from "./active-run.service";
import { parseHyperfineJSON } from "./parser/hyperfine.parser";
import { BenchmarkResult, RunOutput, ToolInfo } from "./parser/hyperfine.types";

export interface RunRequest {
  command: string;
  workingDir?: string;
  runs?: number;
}

export type RunOutcome =
  | { kind: "success"; result: BenchmarkResult; output: RunOutput }
  | { kind: "error"; message: string; output?: RunOutput };

@Injectable({ providedIn: "root" })
export class BenchmarkRunnerService {
  private readonly activeRun = inject(ActiveRunService);

  findHyperfine(): Promise<ToolInfo> {
    return invoke<ToolInfo>("find_hyperfine");
  }

  /** Stops the benchmark that is currently running, if any. Resolves true when one was running. */
  cancel(): Promise<boolean> {
    return invoke<boolean>("cancel_run");
  }

  /** Call only after the user has confirmed the exact command. */
  async run(req: RunRequest): Promise<RunOutcome> {
    let output: RunOutput;
    try {
      output = await this.activeRun.track({ label: "Quick run", suiteId: null }, () =>
        invoke<RunOutput>("run_benchmark", {
          command: req.command,
          workingDir: req.workingDir ?? null,
          runs: req.runs ?? null,
        }),
      );
    } catch (e) {
      return { kind: "error", message: String(e) };
    }

    if (output.cancelled) {
      return { kind: "error", message: "Cancelled.", output };
    }
    if (output.timedOut) {
      return { kind: "error", message: "Benchmark timed out and was killed.", output };
    }
    if (output.exitCode !== 0 || output.json === null) {
      return {
        kind: "error",
        message: `hyperfine exited with code ${output.exitCode ?? "unknown"}.`,
        output,
      };
    }
    try {
      return { kind: "success", result: parseHyperfineJSON(output.json), output };
    } catch (e) {
      return { kind: "error", message: (e as Error).message, output };
    }
  }
}
