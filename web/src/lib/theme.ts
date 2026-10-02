export type ThemeMode = "system" | "light" | "dark";
export type ColorScheme = "light" | "dark";

export const THEME_STORAGE_KEY = "lgtm-theme";

export function parseThemeMode(value: string | null): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveColorScheme(
  mode: ThemeMode,
  prefersDark: boolean,
): ColorScheme {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}
