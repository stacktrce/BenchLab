import { Injectable, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { RunDetail, RunRecord, Suite, SuiteSummary } from "./models";

const RECENT_RUNS = 8;

/** Typed wrapper over the Rust commands, plus the lists the sidebar shows. */
@Injectable({ providedIn: "root" })
export class SuiteApiService {
  readonly suites = signal<SuiteSummary[]>([]);
  readonly recentRuns = signal<RunRecord[]>([]);

  async refresh(): Promise<void> {
    const [suites, runs] = await Promise.all([
      invoke<SuiteSummary[]>("list_suites_cmd"),
      invoke<RunRecord[]>("list_runs_cmd", { suiteId: null, limit: RECENT_RUNS }),
    ]);
    this.suites.set(suites);
    this.recentRuns.set(runs);
  }

  /** Creates (or reuses) the sample suite with two runs. Returns its id. */
  async loadDemo(): Promise<string> {
    const id = await invoke<string>("load_demo_cmd");
    await this.refresh();
    return id;
  }

  getSuite(id: string): Promise<Suite> {
    return invoke<Suite>("get_suite", { id });
  }

  async saveSuite(suite: Suite): Promise<Suite> {
    const saved = await invoke<Suite>("save_suite_cmd", { suite });
    await this.refresh();
    return saved;
  }

  async duplicateSuite(id: string): Promise<Suite> {
    const copy = await invoke<Suite>("duplicate_suite_cmd", { id });
    await this.refresh();
    return copy;
  }

  async deleteSuite(id: string): Promise<void> {
    await invoke<void>("delete_suite_cmd", { id });
    await this.refresh();
  }

  listRuns(suiteId: string, limit = 50): Promise<RunRecord[]> {
    return invoke<RunRecord[]>("list_runs_cmd", { suiteId, limit });
  }

  getRun(id: string): Promise<RunDetail> {
    return invoke<RunDetail>("get_run_cmd", { id });
  }

  /** Stops the running suite (or quick run). The partial run is still recorded. */
  cancelRun(): Promise<boolean> {
    return invoke<boolean>("cancel_run");
  }

  /** Call only after the user has confirmed the exact commands. */
  async runSuite(suiteId: string): Promise<RunDetail> {
    try {
      return await invoke<RunDetail>("run_suite", { suiteId });
    } finally {
      await this.refresh();
    }
  }
}
