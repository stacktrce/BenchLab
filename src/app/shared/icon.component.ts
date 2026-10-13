import { Component, computed, input } from "@angular/core";

const PATHS = {
  plus: "M8 3v10M3 8h10",
  up: "M8 13V3M4 7l4-4 4 4",
  down: "M8 3v10M4 9l4 4 4-4",
  close: "M4 4l8 8M12 4l-8 8",
  swap: "M2 5h11M10 2l3 3-3 3M14 11H3M6 8l-3 3 3 3",
  play: "M4 2.5v11l9-5.5z",
  chevron: "M6 3l5 5-5 5",
  copy: "M5 5V2.5h8.5V11H11M2.5 5H11v8.5H2.5z",
  download: "M8 2v8M4.5 7L8 10.5 11.5 7M3 13.5h10",
  sun: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1",
  moon: "M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z",
  scratch: "M3 13l1-3 7-7 2 2-7 7zM10 4l2 2",
  trash: "M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.5 9h6l.5-9",
  flask: "M6 2h4M7 2v4L3 13a1 1 0 0 0 1 1.5h8A1 1 0 0 0 13 13L9 6V2",
} as const;

export type IconName = keyof typeof PATHS;

@Component({
  selector: "app-icon",
  template: `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path [attr.d]="d()" /></svg>`,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  protected readonly d = computed(() => PATHS[this.name()]);
}
