import { DatePipe } from "@angular/common";
import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { errorMessage } from "../../core/errors";
import { describeGit } from "../../core/format";
import { Latest } from "../../core/latest";
import { HistoryRow, RunStatus } from "../../core/models";
import { SuiteApiService } from "../../core/suite-api.service";
import { ToastService } from "../../core/toast.service";
import { IconComponent } from "../../shared/icon/icon.component";
import { HistoryFilter, parseFilter, serializeFilter, toRunFilter } from "./history-filters";

const PAGE_SIZE = 50;
/** Typing in the search box waits this long before the URL and the results follow. */
const SEARCH_DELAY_MS = 300;

/** Every run across suites: filter, annotate, compare two, delete. Filters live in the URL. */
@Component({
  selector: "app-history",
  imports: [DatePipe, RouterLink, IconComponent],
  templateUrl: "./history.component.html",
  styleUrl: "./history.component.scss",
})
export class HistoryComponent {
  /** Query params, bound by the router. */
  readonly text = input<string>();
  readonly suiteId = input<string>();
  readonly status = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly tag = input<string>();
  readonly page = input<string>();

  protected readonly api = inject(SuiteApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly latestLoad = new Latest();
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly filter = computed<HistoryFilter>(() =>
    parseFilter({
      text: this.text(), suiteId: this.suiteId(), status: this.status(),
      from: this.from(), to: this.to(), tag: this.tag(), page: this.page(),
    }),
  );
  protected readonly rows = signal<HistoryRow[] | null>(null);
  protected readonly total = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly confirmingDelete = signal(false);
  protected readonly editing = signal<string | null>(null);

  protected readonly describeGit = describeGit;
  protected readonly statuses: RunStatus[] = ["completed", "partial", "failed"];
  protected readonly isFiltered = computed(() => Object.keys(serializeFilter({ ...this.filter(), page: 1 })).length > 0);
  protected readonly lastPage = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly range = computed(() => {
    const first = (this.filter().page - 1) * PAGE_SIZE + 1;
    return { first, last: Math.min(first + PAGE_SIZE - 1, this.total()) };
  });
  protected readonly selectedRows = computed(() => (this.rows() ?? []).filter((r) => this.selected().has(r.id)));
  /** Two runs of one suite, both with results, oldest first. */
  protected readonly comparePair = computed(() => {
    const pair = this.selectedRows();
    if (pair.length !== 2 || pair[0].suiteId !== pair[1].suiteId || pair.some((r) => r.status === "failed")) return null;
    return [...pair].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  });

  constructor() {
    effect(() => {
      const filter = this.filter();
      untracked(() => this.load(filter));
    });
  }

  private async load(filter: HistoryFilter): Promise<void> {
    const isCurrent = this.latestLoad.begin();
    this.error.set(null);
    try {
      const page = await this.api.searchRuns(toRunFilter(filter), PAGE_SIZE, (filter.page - 1) * PAGE_SIZE);
      if (!isCurrent()) return;
      this.rows.set(page.items);
      this.total.set(page.total);
      this.selected.set(new Set());
      this.confirmingDelete.set(false);
    } catch (e) {
      if (isCurrent()) this.error.set(errorMessage(e));
    }
  }

  protected update(change: Partial<HistoryFilter>): void {
    const next = { ...this.filter(), page: 1, ...change };
    void this.router.navigate([], { queryParams: serializeFilter(next) });
  }

  protected setStatus(value: string): void {
    this.update({ status: this.statuses.find((s) => s === value) ?? "" });
  }

  protected search(text: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.update({ text }), SEARCH_DELAY_MS);
  }

  protected toggle(id: string): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    this.confirmingDelete.set(false);
  }

  protected compare(): void {
    const pair = this.comparePair();
    if (pair) void this.router.navigate(["/compare"], { queryParams: { baseline: pair[0].id, candidate: pair[1].id } });
  }

  protected async deleteSelected(): Promise<void> {
    const ids = [...this.selected()];
    try {
      const deleted = await this.api.deleteRuns(ids);
      this.toast.show(`Deleted ${deleted} run${deleted === 1 ? "" : "s"}`);
      void this.api.refresh();
      await this.load(this.filter());
    } catch (e) {
      this.toast.show(errorMessage(e), "error");
    }
  }

  protected async saveMeta(row: HistoryRow, note: string, tags: string): Promise<void> {
    try {
      const saved = await this.api.setRunMeta(row.id, note, tags.split(","));
      this.rows.update((rows) => rows?.map((r) => (r.id === row.id ? { ...r, note: saved.note, tags: saved.tags } : r)) ?? null);
      this.editing.set(null);
    } catch (e) {
      this.toast.show(errorMessage(e), "error");
    }
  }
}
