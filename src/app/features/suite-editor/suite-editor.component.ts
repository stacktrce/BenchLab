import { DatePipe } from "@angular/common";
import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from "@angular/core";
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { ActiveRunService } from "../../core/active-run.service";
import { Latest } from "../../core/latest";
import { RunRecord, Suite, SuiteCase } from "../../core/models";
import { SuiteApiService } from "../../core/suite-api.service";
import { ToastService } from "../../core/toast.service";
import { validateSuite } from "../../core/suite-validation";
import { IconComponent } from "../../shared/icon.component";
import { ConfirmItem, RunConfirmComponent } from "../../shared/run-confirm.component";

type Tab = "cases" | "history";

@Component({
  selector: "app-suite-editor",
  imports: [ReactiveFormsModule, RouterLink, DatePipe, RunConfirmComponent, IconComponent],
  templateUrl: "./suite-editor.component.html",
  styleUrl: "./suite-editor.component.css",
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
  private destroyed = false;

  readonly form = this.fb.group({
    name: this.fb.control(""),
    description: this.fb.control(""),
    runs: this.fb.control(10),
    warmup: this.fb.control(1),
    cases: this.fb.array([this.caseGroup()]),
  });

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

  get cases(): FormArray {
    return this.form.controls.cases;
  }

  caseGroup(c?: Partial<SuiteCase>) {
    return this.fb.group({
      id: this.fb.control(c?.id ?? ""),
      name: this.fb.control(c?.name ?? ""),
      command: this.fb.control(c?.command ?? ""),
      setupCommand: this.fb.control(c?.setupCommand ?? ""),
      cleanupCommand: this.fb.control(c?.cleanupCommand ?? ""),
      workingDirectory: this.fb.control(c?.workingDirectory ?? ""),
      enabled: this.fb.control(c?.enabled ?? true),
      budgetPercent: this.fb.control<number | null>(c?.budgetPercent ?? null),
    });
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
      this.setForm({ name: "", description: "", runs: 10, warmup: 1, cases: [] });
      this.cases.push(this.caseGroup());
      this.form.markAsPristine();
      return;
    }
    try {
      const suite = await this.api.getSuite(id);
      if (!isCurrent()) return;
      this.saved.set(suite);
      this.setForm(suite);
      this.form.markAsPristine();
      const runs = await this.api.listRuns(id);
      if (isCurrent()) this.runs.set(runs);
    } catch (e) {
      if (!isCurrent()) return;
      this.saved.set(null);
      this.loadError.set(String(e));
    }
  }

  private setForm(s: Pick<Suite, "name" | "description" | "runs" | "warmup" | "cases">): void {
    this.form.patchValue({ name: s.name, description: s.description, runs: s.runs, warmup: s.warmup });
    this.cases.clear();
    s.cases.forEach((c) => this.cases.push(this.caseGroup(c)));
  }

  private draft(): Suite {
    const v = this.form.getRawValue();
    const saved = this.saved();
    return {
      id: saved?.id ?? "",
      name: v.name,
      description: v.description,
      runs: Number(v.runs),
      warmup: Number(v.warmup),
      baselineRunId: saved?.baselineRunId ?? null,
      schemaVersion: saved?.schemaVersion ?? 0,
      createdAt: saved?.createdAt ?? "",
      updatedAt: saved?.updatedAt ?? "",
      cases: v.cases.map((c) => ({
        ...c,
        setupCommand: c.setupCommand || null,
        cleanupCommand: c.cleanupCommand || null,
        workingDirectory: c.workingDirectory || null,
        budgetPercent: c.budgetPercent ?? null,
      })),
    };
  }

  addCase(): void {
    this.cases.push(this.caseGroup());
    this.form.markAsDirty();
    this.tab.set("cases");
  }

  removeCase(i: number): void {
    this.cases.removeAt(i);
    this.form.markAsDirty();
  }

  move(i: number, delta: -1 | 1): void {
    const j = i + delta;
    if (j < 0 || j >= this.cases.length) return;
    const ctrl = this.cases.at(i);
    this.cases.removeAt(i);
    this.cases.insert(j, ctrl);
    this.form.markAsDirty();
  }

  async save(): Promise<void> {
    if (this.busy() !== "") return;
    const draft = this.draft();
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
        this.setForm(saved);
        this.form.markAsPristine();
      }
    } catch (e) {
      this.problems.set(String(e).split("\n"));
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
      this.problems.set(String(e).split("\n"));
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
      this.problems.set(String(e).split("\n"));
    }
  }

  canRun(): boolean {
    const s = this.saved();
    return !!s && !this.form.dirty && s.cases.some((c) => c.enabled) && this.busy() === "" && !this.activeRun.current();
  }

  runBlockedReason(): string {
    if (!this.saved()) return "Save the suite first";
    if (this.form.dirty) return "Save your changes before running";
    if (!this.saved()!.cases.some((c) => c.enabled)) return "Enable at least one case";
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

  /** Exactly what the backend will execute: the saved, enabled cases. */
  confirmItems(): ConfirmItem[] {
    return (this.saved()?.cases ?? [])
      .filter((c) => c.enabled)
      .map((c) => ({
        name: c.name,
        command: c.command,
        setupCommand: c.setupCommand,
        cleanupCommand: c.cleanupCommand,
        workingDirectory: c.workingDirectory,
      }));
  }

  confirmSummary(): string {
    const s = this.saved();
    if (!s) return "";
    const warm = s.warmup > 0 ? `, after ${s.warmup} warm-up run${s.warmup === 1 ? "" : "s"}` : "";
    return `${this.confirmItems().length} case(s), ${s.runs} timed runs each${warm}`;
  }

  async cancelRun(): Promise<void> {
    try {
      await this.api.cancelRun();
    } catch (e) {
      this.toast.show(`Could not cancel: ${e}`, "error");
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
      if (stillHere()) this.problems.set(String(e).split("\n"));
      else this.toast.show(`Run failed: ${e}`, "error");
    }
  }
}
