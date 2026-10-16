import { Component, computed, inject, input, signal } from "@angular/core";
import { exportFileName, FileExportService } from "../../../core/file-export.service";
import { splitMatches, stripAnsi } from "../../../core/log-text";
import { RunLog } from "../../../core/models";

type StreamFilter = "all" | RunLog["stream"];

const STREAM_LABEL: Record<RunLog["stream"], string> = { hyperfine: "hyperfine", command: "command output" };

/** A run's per-case logs, searchable, as text only: log bodies are never rendered as HTML. */
@Component({
  selector: "app-run-log",
  templateUrl: "./run-log.component.html",
  styleUrl: "./run-log.component.scss",
})
export class RunLogComponent {
  readonly logs = input.required<RunLog[]>();
  /** Cases that failed; their logs start open. */
  readonly failedCases = input<string[]>([]);
  readonly fileBase = input.required<string>();

  private readonly files = inject(FileExportService);
  protected readonly query = signal("");
  protected readonly stream = signal<StreamFilter>("all");
  protected readonly streamLabel = STREAM_LABEL;

  protected readonly hasCommandOutput = computed(() => this.logs().some((l) => l.stream === "command"));
  /** Colour codes stripped once per load, not on every keystroke in the search box. */
  private readonly plain = computed(() => this.logs().map((l) => ({ ...l, body: stripAnsi(l.body) })));
  protected readonly shown = computed(() =>
    this.plain()
      .filter((l) => this.stream() === "all" || l.stream === this.stream())
      .map((l) => ({ ...l, parts: splitMatches(l.body, this.query().trim()) })),
  );
  protected readonly matchCount = computed(() =>
    this.shown().reduce((n, l) => n + l.parts.filter((p) => p.match).length, 0),
  );

  private asText(): string {
    return this.plain()
      .map((l) => `== ${l.case} (${STREAM_LABEL[l.stream]})${l.truncated ? " [truncated]" : ""}\n${l.body}`)
      .join("\n\n");
  }

  protected copy(): void {
    void this.files.copy(this.asText());
  }

  protected save(): void {
    void this.files.save(exportFileName(`${this.fileBase()} log`, "txt"), this.asText(), "txt");
  }

  protected setStream(value: string): void {
    this.stream.set(value === "hyperfine" || value === "command" ? value : "all");
  }
}
