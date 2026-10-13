import { Injectable, signal } from "@angular/core";

export interface Toast {
  text: string;
  kind: "info" | "error";
}

@Injectable({ providedIn: "root" })
export class ToastService {
  readonly current = signal<Toast | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(text: string, kind: Toast["kind"] = "info"): void {
    clearTimeout(this.timer);
    this.current.set({ text, kind });
    this.timer = setTimeout(() => this.current.set(null), kind === "error" ? 8000 : 4000);
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }
}
