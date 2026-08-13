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
  /** Adopt a server-provided theme as current, overriding any locally stored value. */
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

  /** Called whenever the app learns the current site-wide theme (on load,
   *  and whenever the site info is refetched). The site's theme - set by
   *  the admin in Settings - is authoritative for every visitor; there is
   *  no separate per-viewer theme preference to protect here (the only
   *  thing that ever writes to this store otherwise is the admin's own
   *  Settings page, which already applies its choice locally before this
   *  ever runs). Previously this only adopted the server value the very
   *  first time a browser had no stored theme at all, so an admin
   *  changing the site theme later never reached anyone who had already
   *  loaded the site once - fixed by always following the server value. */
  const syncFromServer = useCallback((serverTheme: string) => {
    if (serverTheme !== currentTheme && getThemeMeta(serverTheme)) {
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
