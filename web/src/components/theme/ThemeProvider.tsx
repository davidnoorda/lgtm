import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  parseThemeMode,
  resolveColorScheme,
  THEME_STORAGE_KEY,
  type ColorScheme,
  type ThemeMode,
} from "../../lib/theme";

interface ThemePreference {
  mode: ThemeMode;
  colorScheme: ColorScheme;
  setMode(mode: ThemeMode): void;
}

const ThemeContext = createContext<ThemePreference | undefined>(undefined);

function loadMode(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState(loadMode);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const colorScheme = resolveColorScheme(mode, prefersDark);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", colorScheme === "light");
    root.classList.toggle("dark", colorScheme === "dark");
    root.style.colorScheme = colorScheme;
  }, [colorScheme]);

  const preference = useMemo<ThemePreference>(
    () => ({
      mode,
      colorScheme,
      setMode(next) {
        setMode(next);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // Keep the preference working in memory when storage is unavailable.
        }
      },
    }),
    [mode, colorScheme],
  );

  return (
    <ThemeContext.Provider value={preference}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemePreference {
  const preference = useContext(ThemeContext);
  if (!preference) throw new Error("useTheme requires ThemeProvider");
  return preference;
}
