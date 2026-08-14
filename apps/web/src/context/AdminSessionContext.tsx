import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Identity } from "@anonchat/crypto";
import type { AdminSummaryDto } from "@anonchat/shared";
import { getAdminMe, loginAdmin, logoutAdmin } from "../api/admin.js";
import { ApiError, setAdminUnauthorizedHandler } from "../api/client.js";
import {
  getUnlockedAdminIdentity,
  adminIdentityMatches,
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
  keyIssue: string | null;
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
  const [keyIssue, setKeyIssue] = useState<string | null>(null);

  const refreshAdmin = useCallback(async () => {
    try {
      const me = await getAdminMe();
      setAdmin(me);
      setStatus("signed-in");
      const cached = getUnlockedAdminIdentity();
      if (cached && adminIdentityMatches(cached, me.publicKeys)) {
        setIdentity(cached);
        setNeedsKeyUnlock(false);
        setKeyIssue(null);
      } else {
        if (cached) {
          lockAdminIdentity();
          setIdentity(null);
          setKeyIssue(
            "The encryption key unlocked in this browser belongs to a different Anonchat setup. Import this admin account's recovery key to read messages.",
          );
        }
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
      setKeyIssue(null);
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
          const me = await getAdminMe();
          const unlocked = await unlockAdminIdentity(password, me.publicKeys);
          setIdentity(unlocked);
          setNeedsKeyUnlock(false);
          setKeyIssue(null);
        } catch (error) {
          setKeyIssue(error instanceof Error ? error.message : "The cached encryption key could not be unlocked.");
          setNeedsKeyUnlock(true);
        }
      }
    },
    [refreshAdmin],
  );

  const unlockKey = useCallback(async (password: string) => {
    if (!admin) throw new Error("The admin session is not ready.");
    const unlocked = await unlockAdminIdentity(password, admin.publicKeys);
    setIdentity(unlocked);
    setNeedsKeyUnlock(false);
    setKeyIssue(null);
  }, [admin]);

  const importKey = useCallback(async (phrase: string, password: string) => {
    if (!admin) throw new Error("The admin session is not ready.");
    const unlocked = await importAdminIdentityFromRecoveryPhrase(phrase, password, admin.publicKeys);
    setIdentity(unlocked);
    setNeedsKeyUnlock(false);
    setKeyIssue(null);
  }, [admin]);

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
      setKeyIssue(null);
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
    setKeyIssue(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        status,
        admin,
        identity,
        needsKeyUnlock,
        hasCachedKey,
        keyIssue,
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
