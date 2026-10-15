import { effect, inject, Service, signal } from "@angular/core";
import { ChartPalette } from "./charts/palette";
import { ThemeService } from "./theme.service";

/** The theme's colours as concrete values for canvas charts, updated whenever the theme changes. */
@Service()
export class ChartPaletteService {
  private readonly theme = inject(ThemeService);
  readonly palette = signal<ChartPalette>(readPalette());

  constructor() {
    // Effects run after ThemeService has applied the new theme attribute, so the variables are current.
    effect(() => {
      this.theme.effective();
      this.palette.set(readPalette());
    });
  }
}

function readPalette(): ChartPalette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    ink: read("--ink"),
    muted: read("--ink-2"),
    grid: read("--line"),
    accent: read("--accent"),
    warn: read("--warn"),
    background: read("--bg"),
    font: read("--font"),
    mono: read("--mono"),
  };
}
