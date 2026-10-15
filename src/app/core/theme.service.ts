import { computed, Injectable, signal } from "@angular/core";
import { effectiveTheme, Theme, toggledTheme } from "./theme";

const KEY = "benchlab.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly theme = signal<Theme>(this.read());
  private readonly systemDark = signal(matchMedia(DARK_QUERY).matches);
  /** The theme on screen, with "system" resolved. */
  readonly effective = computed(() => effectiveTheme(this.theme(), this.systemDark()));

  constructor() {
    this.apply(this.theme());
    matchMedia(DARK_QUERY).addEventListener("change", (e) => this.systemDark.set(e.matches));
  }

  toggle(): void {
    this.set(toggledTheme(this.theme(), this.systemDark()));
  }

  set(theme: Theme): void {
    this.apply(theme);
    this.theme.set(theme);
    try {
      localStorage.setItem(KEY, theme);
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
