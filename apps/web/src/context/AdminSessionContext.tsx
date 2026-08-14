import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Identity } from "@anonchat/crypto";
import type { AdminSummaryDto } from "@anonchat/shared";
import { getAdminMe, loginAdmin, logoutAdmin } from "../api/admin.js";
import { ApiError, setAdminUnauthorizedHandler } from "../api/client.js";
import {
  getUnlockedAdminIdentity,
  hasCachedAdminKey,
  importAdminIdentityFromRecoveryPhrase,
  lockAdminIdentity,
  unlockAdminIdentity,
} from "../crypto/adminKeyStore.js";

interface AdminSessionContextValue {
  status: "loading" | "signed-out" | "signed-in";
  admin: AdminSummaryDto | null;
  identity: Identity | null;
  needsKeyUnlock: boolean;
  /** Whether this browser has a wrapped key cached at all - false means it's
   *  a genuinely new device, so UnlockKey should default straight to the
   *  recovery-phrase import flow instead of a password prompt that can only fail. */
  hasCachedKey: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<void>;
  unlockKey: (password: string) => Promise<void>;
  importKey: (phrase: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAdmin: () => Promise<void>;
}

const Ctx = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminSessionContextValue["status"]>("loading");
  const [admin, setAdmin] = useState<AdminSummaryDto | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(getUnlockedAdminIdentity());
  const [needsKeyUnlock, setNeedsKeyUnlock] = useState(false);
  const [hasCachedKey, setHasCachedKey] = useState(false);

  const refreshAdmin = useCallback(async () => {
    try {
      const me = await getAdminMe();
      setAdmin(me);
      setStatus("signed-in");
      const cached = getUnlockedAdminIdentity();
      if (cached) {
        setIdentity(cached);
        setNeedsKeyUnlock(false);
      } else {
        // Needs unlocking either way: a cached wrapped key just needs this
        // browser's login password re-entered, and NO cached key at all
        // (a genuinely new device) needs the recovery-phrase import flow -
        // both live behind UnlockKey, which was previously only reachable
        // in the first case, silently stranding new-device admins on an
        // infinite "Unlocking…" spinner in every conversation.
        setHasCachedKey(await hasCachedAdminKey());
        setNeedsKeyUnlock(true);
      }
    } catch {
      setAdmin(null);
      setStatus("signed-out");
    }
  }, []);

  useEffect(() => {
    void refreshAdmin();
  }, [refreshAdmin]);

  const login = useCallback(
    async (username: string, password: string, totpCode?: string) => {
      await loginAdmin(username, password, totpCode);
      await refreshAdmin();
      const cached = getUnlockedAdminIdentity();
      if (!cached && (await hasCachedAdminKey())) {
        try {
          const unlocked = await unlockAdminIdentity(password);
          setIdentity(unlocked);
          setNeedsKeyUnlock(false);
        } catch {
          setNeedsKeyUnlock(true);
        }
      }
    },
    [refreshAdmin],
  );

  const unlockKey = useCallback(async (password: string) => {
    const unlocked = await unlockAdminIdentity(password);
    setIdentity(unlocked);
    setNeedsKeyUnlock(false);
  }, []);

  const importKey = useCallback(async (phrase: string, password: string) => {
    const unlocked = await importAdminIdentityFromRecoveryPhrase(phrase, password);
    setIdentity(unlocked);
    setNeedsKeyUnlock(false);
  }, []);

  // Drop straight to the sign-in screen the moment any /admin/* request
  // comes back 401 - e.g. another device revoked this session from the
  // Sessions page. Deliberately doesn't call the logoutAdmin() API (that's
  // what `logout` below does): the session is already invalid server-side,
  // so that call would just 401 again.
  useEffect(() => {
    setAdminUnauthorizedHandler(() => {
      lockAdminIdentity();
      setIdentity(null);
      setAdmin(null);
      setStatus("signed-out");
    });
    return () => setAdminUnauthorizedHandler(null);
  }, []);

  const logout = useCallback(async () => {
    await logoutAdmin().catch((err: unknown) => {
      if (!(err instanceof ApiError)) throw err;
    });
    lockAdminIdentity();
    setIdentity(null);
    setAdmin(null);
    setStatus("signed-out");
  }, []);

  return (
    <Ctx.Provider
      value={{
        status,
        admin,
        identity,
        needsKeyUnlock,
        hasCachedKey,
        login,
        unlockKey,
        importKey,
        logout,
        refreshAdmin,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAdminSession(): AdminSessionContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminSession must be used within AdminSessionProvider");
  return ctx;
}
