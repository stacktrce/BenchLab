import { Component, computed, effect, inject, input, signal } from "@angular/core";
import { NonNullableFormBuilder, ReactiveFormsModule } from "@angular/forms";
import { IconComponent } from "../../../shared/icon/icon.component";
import { CaseFormArray, createCaseGroup } from "../suite-form";

/** Editable list of a suite's cases. Changes mark the whole suite form dirty. */
@Component({
  selector: "app-case-list",
  imports: [ReactiveFormsModule, IconComponent],
  templateUrl: "./case-list.component.html",
  styleUrl: "./case-list.component.scss",
})
export class CaseListComponent {
  readonly cases = input.required<CaseFormArray>();

  private readonly fb = inject(NonNullableFormBuilder);

  /**
   * The page refills the same FormArray when it loads a suite, so the input never changes and
   * this OnPush view would not re-render. Every change to the array bumps this instead.
   */
  private readonly changes = signal(0);
  protected readonly controls = computed(() => {
    this.changes();
    return [...this.cases().controls];
  });

  constructor() {
    effect((onCleanup) => {
      const subscription = this.cases().valueChanges.subscribe(() => this.changes.update((n) => n + 1));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected addCase(): void {
    this.cases().push(createCaseGroup(this.fb));
    this.cases().markAsDirty();
  }

  protected removeCase(i: number): void {
    this.cases().removeAt(i);
    this.cases().markAsDirty();
  }

  protected move(i: number, delta: -1 | 1): void {
    const cases = this.cases();
    const j = i + delta;
    if (j < 0 || j >= cases.length) return;
    const ctrl = cases.at(i);
    cases.removeAt(i);
    cases.insert(j, ctrl);
    cases.markAsDirty();
  }
}
