import { inject, Injectable, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { ActiveRunService } from "./active-run.service";
import { CasePoint, RunDetail, RunLog, RunRecord, Suite, SuiteSummary } from "./models";

const RECENT_RUNS = 8;

/** Typed wrapper over the Rust commands, plus the lists the sidebar shows. */
@Injectable({ providedIn: "root" })
export class SuiteApiService {
  private readonly activeRun = inject(ActiveRunService);
  readonly suites = signal<SuiteSummary[]>([]);
  readonly recentRuns = signal<RunRecord[]>([]);

  async refresh(): Promise<void> {
    const [suites, runs] = await Promise.all([
      invoke<SuiteSummary[]>("list_suites"),
      invoke<RunRecord[]>("list_runs", { suiteId: null, limit: RECENT_RUNS }),
    ]);
    this.suites.set(suites);
    this.recentRuns.set(runs);
  }

  /** Creates (or reuses) the sample suite with two runs. Returns its id. */
  async loadDemo(): Promise<string> {
    const id = await invoke<string>("load_demo");
    await this.refresh();
    return id;
  }

  getSuite(id: string): Promise<Suite> {
    return invoke<Suite>("get_suite", { id });
  }

  async saveSuite(suite: Suite): Promise<Suite> {
    const saved = await invoke<Suite>("save_suite", { suite });
    await this.refresh();
    return saved;
  }

  /** Pins a run as the suite's baseline, or clears it with null. */
  async setBaseline(suiteId: string, runId: string | null): Promise<Suite> {
    return invoke<Suite>("set_baseline", { suiteId, runId });
  }

  async duplicateSuite(id: string): Promise<Suite> {
    const copy = await invoke<Suite>("duplicate_suite", { id });
    await this.refresh();
    return copy;
  }

  async deleteSuite(id: string): Promise<void> {
    await invoke<void>("delete_suite", { id });
    await this.refresh();
  }

  listRuns(suiteId: string, limit = 50): Promise<RunRecord[]> {
    return invoke<RunRecord[]>("list_runs", { suiteId, limit });
  }

  /** The newest `limit` runs that include the case, oldest first. A run without the case is absent. */
  caseSeries(suiteId: string, caseName: string, limit = 500): Promise<CasePoint[]> {
    return invoke<CasePoint[]>("case_series", { suiteId, caseName, limit });
  }

  /** Every case name that appears in any run of the suite. */
  caseNames(suiteId: string): Promise<string[]> {
    return invoke<string[]>("case_names", { suiteId });
  }

  getRun(id: string): Promise<RunDetail> {
    return invoke<RunDetail>("get_run", { id });
  }

  /** Seconds taken by the suite's last completed runs, newest first. */
  suiteRunDurations(suiteId: string): Promise<number[]> {
    return invoke<number[]>("suite_run_durations", { suiteId, limit: 3 });
  }

  /** Per-case logs in the order the cases ran; empty for runs recorded before logs existed. */
  runLogs(runId: string): Promise<RunLog[]> {
    return invoke<RunLog[]>("get_run_logs", { id: runId });
  }

  /** Stops the running suite (or quick run). The partial run is still recorded. */
  cancelRun(): Promise<boolean> {
    return invoke<boolean>("cancel_run");
  }

  /** Call only after the user has confirmed the exact commands. `label` is what the sidebar shows while it runs. */
  runSuite(suiteId: string, label: string): Promise<RunDetail> {
    return this.activeRun.track({ label, suiteId }, async () => {
      try {
        return await invoke<RunDetail>("run_suite", { suiteId });
      } finally {
        await this.refresh();
      }
    });
  }
}
