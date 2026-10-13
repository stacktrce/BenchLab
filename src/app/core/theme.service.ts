import { Injectable, signal } from "@angular/core";

export type Theme = "system" | "light" | "dark";
const KEY = "benchlab.theme";
const ORDER: Theme[] = ["system", "light", "dark"];

@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly theme = signal<Theme>(this.read());

  constructor() {
    this.apply(this.theme());
  }

  cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.theme()) + 1) % ORDER.length];
    this.theme.set(next);
    this.apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
  }

  private read(): Theme {
    try {
      const v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : "system";
    } catch {
      return "system";
    }
  }

  private apply(theme: Theme): void {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }
}
