import { DatePipe } from "@angular/common";
import { Component, input, output } from "@angular/core";
import { RunRecord } from "../../../core/models";
import { IconComponent } from "../../../shared/icon/icon.component";

/** Baseline and candidate selects. A run cannot be picked on both sides. */
@Component({
  selector: "app-run-pickers",
  imports: [DatePipe, IconComponent],
  templateUrl: "./run-pickers.component.html",
  styleUrl: "./run-pickers.component.scss",
})
export class RunPickersComponent {
  readonly runs = input.required<RunRecord[]>();
  readonly candidateId = input.required<string>();
  readonly baselineId = input<string | null>(null);

  readonly picked = output<{ which: "baseline" | "candidate"; id: string }>();
  readonly swapped = output<void>();
}
