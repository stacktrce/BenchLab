import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from "@angular/core";
import { NonNullableFormBuilder, ReactiveFormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { ActiveRunService } from "../../core/active-run.service";
import { errorMessage } from "../../core/errors";
import { Latest } from "../../core/latest";
import { RunRecord, Suite } from "../../core/models";
import { RunProgressService } from "../../core/run-progress.service";
import { SuiteApiService } from "../../core/suite-api.service";
import { ToastService } from "../../core/toast.service";
import { validateSuite } from "../../core/suite-validation";
import { IconComponent } from "../../shared/icon/icon.component";
import { ConfirmItem, RunConfirmComponent } from "../../shared/run-confirm/run-confirm.component";
import { confirmItems, confirmSummary } from "./run-confirmation";
import { CaseListComponent } from "./case-list/case-list.component";
import { RunHistoryComponent } from "./run-history/run-history.component";
import { CaseFormArray, createSuiteForm, fillSuiteForm, formToDraft } from "./suite-form";

type Tab = "cases" | "history";

@Component({
  selector: "app-suite-editor",
  imports: [ReactiveFormsModule, RouterLink, RunConfirmComponent, IconComponent, CaseListComponent, RunHistoryComponent],
  templateUrl: "./suite-editor.component.html",
  styleUrl: "./suite-editor.component.scss",
  host: {
    "(document:keydown.control.s)": "onSaveKey($event)",
    "(document:keydown.meta.s)": "onSaveKey($event)",
    "(document:keydown.control.enter)": "onRunKey($event)",
    "(document:keydown.meta.enter)": "onRunKey($event)",
  },
})
export class SuiteEditorComponent {
  /** Route param; absent on /suites/new. */
  readonly id = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SuiteApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly latestLoad = new Latest();
  private readonly activeRun = inject(ActiveRunService);
  private readonly progress = inject(RunProgressService);
  private destroyed = false;

  readonly form = createSuiteForm(this.fb);

  readonly saved = signal<Suite | null>(null);
  readonly runs = signal<RunRecord[]>([]);
  readonly problems = signal<string[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal<"" | "saving">("");
  /** This suite is the one running now (it may have been started before this page was opened). */
  readonly running = computed(() => {
    const suite = this.saved();
    return !!suite && this.activeRun.current()?.suiteId === suite.id;
  });
  /** Progress of this suite's run, shown on its page as well as in the sidebar. */
  protected readonly liveProgress = computed(() => {
    const p = this.progress.view();
    return p && this.running() && p.suiteId === this.saved()?.id ? p : null;
  });
  readonly confirmingRun = signal(false);
  readonly confirmingDelete = signal(false);
  readonly tab = signal<Tab>("cases");

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  get cases(): CaseFormArray {
    return this.form.controls.cases;
  }

  private async load(id: string | undefined): Promise<void> {
    const isCurrent = this.latestLoad.begin();
    this.problems.set([]);
    this.loadError.set(null);
    this.confirmingDelete.set(false);
    this.confirmingRun.set(false);
    this.tab.set("cases");
    if (!id) {
      this.saved.set(null);
      this.runs.set([]);
      fillSuiteForm(this.form, this.fb, { name: "", description: "", runs: 10, warmup: 1, cases: [{}] });
      this.form.markAsPristine();
      return;
    }
    try {
      const suite = await this.api.getSuite(id);
      if (!isCurrent()) return;
      this.saved.set(suite);
      fillSuiteForm(this.form, this.fb, suite);
      this.form.markAsPristine();
      const runs = await this.api.listRuns(id);
      if (isCurrent()) this.runs.set(runs);
    } catch (e) {
      if (!isCurrent()) return;
      this.saved.set(null);
      this.loadError.set(errorMessage(e));
    }
  }

  async save(): Promise<void> {
    if (this.busy() !== "") return;
    const draft = formToDraft(this.form.getRawValue(), this.saved());
    const problems = validateSuite(draft);
    this.problems.set(problems);
    if (problems.length) return;

    this.busy.set("saving");
    try {
      const saved = await this.api.saveSuite(draft);
      this.problems.set([]);
      this.toast.show("Saved");
      if (!this.id()) {
        await this.router.navigate(["/suites", saved.id], { replaceUrl: true });
      } else {
        this.saved.set(saved);
        fillSuiteForm(this.form, this.fb, saved);
        this.form.markAsPristine();
      }
    } catch (e) {
      this.problems.set(errorMessage(e).split("\n"));
    } finally {
      this.busy.set("");
    }
  }

  async duplicate(): Promise<void> {
    const id = this.saved()?.id;
    if (!id) return;
    try {
      const copy = await this.api.duplicateSuite(id);
      await this.router.navigate(["/suites", copy.id]);
    } catch (e) {
      this.problems.set(errorMessage(e).split("\n"));
    }
  }

  async remove(): Promise<void> {
    const id = this.saved()?.id;
    if (!id) return;
    try {
      await this.api.deleteSuite(id);
      this.toast.show("Suite deleted");
      await this.router.navigate(["/quick"]);
    } catch (e) {
      this.problems.set(errorMessage(e).split("\n"));
    }
  }

  canRun(): boolean {
    const s = this.saved();
    return !!s && !this.form.dirty && s.cases.some((c) => c.enabled) && this.busy() === "" && !this.activeRun.current();
  }

  runBlockedReason(): string {
    const suite = this.saved();
    if (!suite) return "Save the suite first";
    if (this.form.dirty) return "Save your changes before running";
    if (!suite.cases.some((c) => c.enabled)) return "Enable at least one case";
    if (this.activeRun.current()) return "Another benchmark is running";
    return "";
  }

  protected onSaveKey(event: Event): void {
    event.preventDefault();
    this.save();
  }

  protected onRunKey(event: Event): void {
    if (this.canRun() && !this.confirmingRun()) {
      event.preventDefault();
      this.confirmingRun.set(true);
    }
  }

  confirmItems(): ConfirmItem[] {
    return confirmItems(this.saved());
  }

  confirmSummary(): string {
    return confirmSummary(this.saved());
  }

  async cancelRun(): Promise<void> {
    try {
      await this.api.cancelRun();
    } catch (e) {
      this.toast.show(`Could not cancel: ${errorMessage(e)}`, "error");
    }
  }

  async runConfirmed(): Promise<void> {
    const suite = this.saved();
    this.confirmingRun.set(false);
    if (!suite) return;
    this.problems.set([]);
    // The run goes on if you leave this page, so afterwards only act on this page if you are
    // still looking at this suite.
    const stillHere = () => !this.destroyed && this.saved()?.id === suite.id;
    try {
      const detail = await this.api.runSuite(suite.id, suite.name);
      if (stillHere()) await this.router.navigate(["/runs", detail.record.id]);
      else this.toast.show(`Run finished: ${suite.name}. Open it from Recent runs.`);
    } catch (e) {
      if (stillHere()) this.problems.set(errorMessage(e).split("\n"));
      else this.toast.show(`Run failed: ${errorMessage(e)}`, "error");
    }
  }
}
