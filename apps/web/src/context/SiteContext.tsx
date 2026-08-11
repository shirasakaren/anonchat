import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicSiteInfoDto } from "@termine/shared";
import { getSiteInfo } from "../api/site.js";

interface SiteContextValue {
  site: PublicSiteInfoDto | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<PublicSiteInfoDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSiteInfo()
      .then((info) => {
        if (!cancelled) setSite(info);
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server. Please check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return (
    <SiteContext.Provider value={{ site, loading, error, refresh: () => setNonce((n) => n + 1) }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSite must be used within SiteProvider");
  return ctx;
}
