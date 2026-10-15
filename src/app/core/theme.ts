/** A user's choice; "system" follows the operating system. */
export type Theme = "system" | "light" | "dark";

export const effectiveTheme = (theme: Theme, systemDark: boolean): "light" | "dark" =>
  theme === "system" ? (systemDark ? "dark" : "light") : theme;

/** One click must change the screen. Cycling through "system" made it look like a delay. */
export const toggledTheme = (theme: Theme, systemDark: boolean): "light" | "dark" =>
  effectiveTheme(theme, systemDark) === "dark" ? "light" : "dark";
