import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_THEME, THEMES, type ThemeMeta, getThemeMeta } from "../themes/index.js";

// ── Store ──────────────────────────────────────────────────────────────

const THEME_KEY = "anonchat:theme";

function readStoredTheme(): string {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored && getThemeMeta(stored)) return stored;
  } catch {
    /* localStorage may be unavailable */
  }
  return DEFAULT_THEME;
}

function writeStoredTheme(id: string): void {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* ignore */
  }
}

// ── Simple external store for useSyncExternalStore ─────────────────────

let currentTheme = readStoredTheme();
const listeners = new Set<() => void>();

function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshotTheme(): string {
  return currentTheme;
}

function applyDataThemeAttribute(id: string): void {
  const meta = getThemeMeta(id);
  const resolved = meta ? id : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", resolved);
}

// Apply eagerly so there is no flash of unstyled content before React
// hydrates (the :root defaults already match monochrome-dark).
applyDataThemeAttribute(currentTheme);

// ── Context ────────────────────────────────────────────────────────────

interface ThemeContextValue {
  /** The current theme id (e.g. "monochrome-dark"). */
  theme: string;
  /** The current theme's metadata. */
  meta: ThemeMeta;
  /** All available themes. */
  allThemes: ThemeMeta[];
  /** Change the active theme. Persists to localStorage and updates the DOM. */
  setTheme: (id: string) => void;
  /** Sync the stored theme with a server-provided value (called once on load). */
  syncFromServer: (serverTheme: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getSnapshotTheme);
  const meta = getThemeMeta(theme) ?? getThemeMeta(DEFAULT_THEME)!;

  const setTheme = useCallback((id: string) => {
    const resolved = getThemeMeta(id);
    if (!resolved) return;
    currentTheme = id;
    writeStoredTheme(id);
    applyDataThemeAttribute(id);
    listeners.forEach((cb) => cb());
  }, []);

  /** Called once when the app first learns the server-side theme.
   *  Only overrides localStorage if there is no stored preference yet. */
  const syncFromServer = useCallback((serverTheme: string) => {
    const stored = readStoredTheme();
    // If the stored theme is still the default AND the server has a
    // different value, adopt the server's theme. Otherwise keep the
    // user's local override.
    if (stored === DEFAULT_THEME && serverTheme !== DEFAULT_THEME && getThemeMeta(serverTheme)) {
      currentTheme = serverTheme;
      writeStoredTheme(serverTheme);
      applyDataThemeAttribute(serverTheme);
      listeners.forEach((cb) => cb());
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, meta, allThemes: THEMES, setTheme, syncFromServer }),
    [theme, meta, setTheme, syncFromServer],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
