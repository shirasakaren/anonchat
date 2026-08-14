import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicSiteInfoDto } from "@anonchat/shared";
import { getSiteInfo } from "../api/site.js";

interface SiteContextValue {
  site: PublicSiteInfoDto | null;
  loading: boolean;
  error: string | null;
  /** Refetches and awaits the result, so callers can rely on `site` being current before acting on it (e.g. navigating right after onboarding completes). */
  refresh: () => Promise<void>;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<PublicSiteInfoDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const siteTitle = site?.siteTitle;
  const faviconUrl = site?.avatarUrl ?? "/icon.svg";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await getSiteInfo();
      setSite(info);
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!siteTitle) return;
    document.title = siteTitle;
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.append(favicon);
    }
    favicon.href = faviconUrl;
  }, [faviconUrl, siteTitle]);

  return <SiteContext.Provider value={{ site, loading, error, refresh }}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSite must be used within SiteProvider");
  return ctx;
}
