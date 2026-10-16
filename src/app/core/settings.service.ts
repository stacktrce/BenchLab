import { effect, inject, Service, signal } from "@angular/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ACCENT_VARIABLES, ACCENTS, accentVars, DEFAULT_ACCENT, TEXT_SIZES } from "./appearance";
import { ThemeService } from "./theme.service";

export interface Settings {
  accent: string;
  textSize: string;
  /** Used for a new suite. */
  defaultRuns: number;
  defaultWarmup: number;
}

const KEY = "benchlab.settings";
/** Highest run count accepted for new suites. */
export const MAX_COUNT = 10_000;
export const DEFAULT_SETTINGS: Settings = { accent: DEFAULT_ACCENT, textSize: "normal", defaultRuns: 10, defaultWarmup: 1 };

/** Keeps only known, sane values, so a damaged or older entry cannot break the app. */
export function cleanSettings(raw: unknown): Settings {
  const value = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const count = (v: unknown, min: number, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= MAX_COUNT ? v : fallback;
  return {
    accent: ACCENTS.some((a) => a.id === value.accent) ? (value.accent as string) : DEFAULT_SETTINGS.accent,
    textSize: TEXT_SIZES.some((t) => t.id === value.textSize) ? (value.textSize as string) : DEFAULT_SETTINGS.textSize,
    defaultRuns: count(value.defaultRuns, 1, DEFAULT_SETTINGS.defaultRuns),
    defaultWarmup: count(value.defaultWarmup, 0, DEFAULT_SETTINGS.defaultWarmup),
  };
}

/** Appearance and defaults chosen on the Settings page, kept in this browser profile. */
@Service()
export class SettingsService {
  private readonly theme = inject(ThemeService);
  readonly settings = signal<Settings>(this.read());
  /** Bumped after the accent variables are applied, so canvas charts know to re-read them. */
  readonly applied = signal(0);

  constructor() {
    effect(() => {
      const vars = accentVars(this.settings().accent, this.theme.effective());
      const root = document.documentElement.style;
      for (const name of ACCENT_VARIABLES) root.removeProperty(name);
      for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
      this.applied.update((n) => n + 1);
    });
    effect(() => {
      const zoom = TEXT_SIZES.find((t) => t.id === this.settings().textSize)?.zoom ?? 1;
      // Outside the desktop app (the UI audit) there is no webview to zoom.
      getCurrentWebviewSafe()?.setZoom(zoom).catch(() => undefined);
    });
  }

  update(change: Partial<Settings>): void {
    const next = cleanSettings({ ...this.settings(), ...change });
    this.settings.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: settings still apply for this session */
    }
  }

  private read(): Settings {
    try {
      return cleanSettings(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
}

function getCurrentWebviewSafe() {
  try {
    return getCurrentWebview();
  } catch {
    return null;
  }
}
