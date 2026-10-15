import { DatePipe } from "@angular/common";
import { Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { RunRecord } from "../../../core/models";

/** A suite's runs, newest first, with the pinned baseline marked. */
@Component({
  selector: "app-run-history",
  imports: [DatePipe, RouterLink],
  templateUrl: "./run-history.component.html",
  styleUrl: "./run-history.component.scss",
})
export class RunHistoryComponent {
  readonly runs = input.required<RunRecord[]>();
  readonly baselineRunId = input<string | null>(null);
}
