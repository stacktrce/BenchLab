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
  template: `
    <div class="backdrop" (click)="cancelled.emit()">
      <div
        #dialog
        class="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        (click)="$event.stopPropagation()"
        (keydown.tab)="trap($event, false)"
        (keydown.shift.tab)="trap($event, true)"
      >
        <h2 id="confirm-title">{{ heading() }}</h2>
        <p class="muted lead">These commands will run on this machine through hyperfine.</p>
        <div class="items" tabindex="0" role="region" aria-label="Commands to run">
          @for (item of items(); track $index) {
            <div class="item">
              @if (item.name) {
                <div class="item-name">{{ item.name }}</div>
              }
              <pre>{{ item.command }}</pre>
              @if (item.setupCommand) {
                <div class="faint">setup <code>{{ item.setupCommand }}</code></div>
              }
              @if (item.cleanupCommand) {
                <div class="faint">cleanup <code>{{ item.cleanupCommand }}</code></div>
              }
              <div class="faint">in {{ item.workingDirectory || "the working directory of the app" }}</div>
            </div>
          }
        </div>
        @if (summary()) {
          <p class="muted summary">{{ summary() }}</p>
        }
        <div class="actions">
          <button type="button" class="quiet" (click)="cancelled.emit()">Cancel</button>
          <button #primary type="button" class="run" (click)="confirmed.emit()">Run</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .lead {
      margin: 2px 0 10px;
    }
    .items {
      max-height: 42vh;
      overflow-y: auto;
    }
    .item {
      padding: 6px 0;
    }
    .item + .item {
      border-top: 1px solid var(--line);
    }
    .item-name {
      font-weight: 500;
    }
    .item pre {
      margin: 4px 0;
    }
    .summary {
      margin-top: 8px;
    }
  `,
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
