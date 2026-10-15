import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, output, viewChild } from "@angular/core";

export interface ConfirmItem {
  name?: string;
  command: string;
  setupCommand?: string | null;
  cleanupCommand?: string | null;
  workingDirectory?: string | null;
}

/** Pre-flight dialog: shows exactly what will be executed. Nothing runs until `confirmed` fires. */
@Component({
  selector: "app-run-confirm",
  host: { "(document:keydown.escape)": "cancelled.emit()" },
  templateUrl: "./run-confirm.component.html",
  styleUrl: "./run-confirm.component.scss",
})
export class RunConfirmComponent {
  readonly heading = input("Run this?");
  readonly items = input.required<ConfirmItem[]>();
  readonly summary = input("");
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>("dialog");
  private readonly primary = viewChild.required<ElementRef<HTMLButtonElement>>("primary");

  constructor() {
    // Whatever opened the dialog gets focus back when it closes. Opened by a shortcut with
    // nothing focused, there is nothing to restore.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inject(DestroyRef).onDestroy(() => opener?.focus());
    afterNextRender(() => this.primary().nativeElement.focus());
  }

  /** Keeps Tab inside the dialog while it is open. */
  protected trap(event: Event, backwards: boolean): void {
    const focusable = Array.from(this.dialog().nativeElement.querySelectorAll<HTMLElement>(
        "button, [href], input, [tabindex]:not([tabindex='-1'])",
      ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (backwards && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!backwards && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
