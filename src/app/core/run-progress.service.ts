import { computed, DestroyRef, inject, Service, signal } from "@angular/core";
import { listen } from "@tauri-apps/api/event";
import { estimateRemainingSeconds, foldProgress, formatClock, RunEvent, RunProgress } from "./run-progress";
import { SuiteApiService } from "./suite-api.service";

export interface ProgressView {
  suiteId: string;
  /** "Case 2 of 4 · array join" */
  step: string;
  elapsed: string;
  /** "about 1:10 left", "almost done", or null when there is no history to estimate from. */
  left: string | null;
}

/**
 * Live progress of the suite run in progress, from the backend's `run-progress` events. It lives
 * in a service so leaving the page that started a run does not lose it.
 */
@Service()
export class RunProgressService {
  private readonly api = inject(SuiteApiService);
  private readonly state = signal<RunProgress | null>(null);
  private readonly pastDurations = signal<number[]>([]);
  /** Ticks every second while a run is in progress, so elapsed time and the estimate move. */
  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly view = computed<ProgressView | null>(() => {
    const s = this.state();
    if (!s || s.finished) return null;
    const now = this.now();
    const index = Math.min(s.done + 1, s.total);
    const left = estimateRemainingSeconds(this.pastDurations(), s.done, s.total, (now - s.caseStartedAt) / 1000);
    return {
      suiteId: s.suiteId,
      step: `Case ${index} of ${s.total}${s.caseName ? ` · ${s.caseName}` : ""}`,
      elapsed: formatClock((now - s.startedAt) / 1000),
      left: left === null ? null : left < 1 ? "almost done" : `about ${formatClock(left)} left`,
    };
  });

  constructor() {
    const unlisten = listen<RunEvent>("run-progress", (e) => this.apply(e.payload));
    inject(DestroyRef).onDestroy(() => {
      this.stopTicking();
      void unlisten.then((stop) => stop());
    });
  }

  private apply(event: RunEvent): void {
    const now = Date.now();
    this.now.set(now);
    this.state.update((s) => foldProgress(s, event, now));
    if (event.type === "started") {
      this.pastDurations.set([]);
      this.api.suiteRunDurations(event.suiteId).then(
        (d) => this.pastDurations.set(d),
        () => this.pastDurations.set([]),
      );
      this.startTicking();
    } else if (event.type === "finished") {
      this.stopTicking();
    }
  }

  private startTicking(): void {
    this.stopTicking();
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }

  private stopTicking(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
