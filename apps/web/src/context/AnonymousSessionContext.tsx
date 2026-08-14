import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Identity } from "@anonchat/crypto";
import type { PublicKeysInput } from "@anonchat/shared";
import {
  getAnonymousMe,
  deleteAnonymousIdentity,
  logoutAnonymous,
  recoverAnonymousSession,
  registerAnonymousIdentity,
} from "../api/anonymous.js";
import { ApiError } from "../api/client.js";
import {
  createIdentity as createIdentityInStore,
  getActiveIdentityId,
  importIdentityFromRecoveryPhrase,
  loadIdentity,
  removeIdentity,
  setActiveIdentityId,
  touchIdentity,
} from "../crypto/identityStore.js";
import { deleteEncryptedDraft } from "../crypto/encryptedDrafts.js";

interface SessionState {
  identity: Identity;
  publicId: string;
  conversationId: string;
  conversationStatus: "ACTIVE" | "ARCHIVED" | "BLOCKED";
  adminPublicKeys: PublicKeysInput;
}

interface AnonymousSessionContextValue {
  status: "loading" | "needs-identity" | "ready" | "error";
  session: SessionState | null;
  error: string | null;
  createNewIdentity: () => Promise<{ recoveryPhrase: string; publicId: string }>;
  continueWithStoredIdentity: (publicId: string) => Promise<void>;
  importFromRecoveryPhrase: (phrase: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteIdentity: () => Promise<void>;
  /** Escape hatch for a broken identity (e.g. the server has no record of it
   *  anymore - deleted, or a dev/test database reset): discards it from this
   *  device and drops back to "needs-identity" so the visitor can start a
   *  brand new anonymous chat instead of being stuck reloading the same
   *  failure forever. */
  discardBrokenIdentity: () => Promise<void>;
  setConversationStatus: (status: SessionState["conversationStatus"]) => void;
}

const Ctx = createContext<AnonymousSessionContextValue | null>(null);

export function AnonymousSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AnonymousSessionContextValue["status"]>("loading");
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const establish = useCallback(async (identity: Identity) => {
    try {
      const me = await getAnonymousMe();
      setSession({
        identity,
        publicId: me.publicId,
        conversationId: me.conversationId,
        conversationStatus: me.conversationStatus,
        adminPublicKeys: me.adminPublicKeys,
      });
      setStatus("ready");
      return;
    } catch {
      // Session cookie missing/expired - redo challenge-response login.
    }
    const recovered = await recoverAnonymousSession(identity);
    setSession({
      identity,
      publicId: recovered.publicId,
      conversationId: recovered.conversationId,
      conversationStatus: "ACTIVE",
      adminPublicKeys: recovered.adminPublicKeys,
    });
    setStatus("ready");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const activeId = getActiveIdentityId();
      if (!activeId) {
        if (!cancelled) setStatus("needs-identity");
        return;
      }
      const identity = await loadIdentity(activeId);
      if (!identity) {
        if (!cancelled) setStatus("needs-identity");
        return;
      }
      try {
        await establish(identity);
        await touchIdentity(activeId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not restore your session.");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [establish]);

  const createNewIdentity = useCallback(async () => {
    const { identity, recoveryPhrase } = await createIdentityInStore();
    const registered = await registerAnonymousIdentity(identity);
    setSession({
      identity,
      publicId: registered.publicId,
      conversationId: registered.conversationId,
      conversationStatus: "ACTIVE",
      adminPublicKeys: registered.adminPublicKeys,
    });
    setStatus("ready");
    return { recoveryPhrase, publicId: identity.publicId };
  }, []);

  const continueWithStoredIdentity = useCallback(
    async (publicId: string) => {
      const identity = await loadIdentity(publicId);
      if (!identity) throw new Error("That identity is no longer available on this device.");
      setActiveIdentityId(publicId);
      setStatus("loading");
      await establish(identity);
      await touchIdentity(publicId);
    },
    [establish],
  );

  const importFromRecoveryPhrase = useCallback(
    async (phrase: string) => {
      const identity = await importIdentityFromRecoveryPhrase(phrase);
      setStatus("loading");
      await establish(identity);
    },
    [establish],
  );

  const logout = useCallback(async () => {
    await logoutAnonymous().catch(() => {});
    setSession(null);
    setStatus("needs-identity");
  }, []);

  const deleteIdentity = useCallback(async () => {
    if (!session) return;
    const { publicId, conversationId } = session;
    await deleteAnonymousIdentity();
    deleteEncryptedDraft("USER", conversationId);
    await removeIdentity(publicId);
    setSession(null);
    setError(null);
    setStatus("needs-identity");
  }, [session]);

  const discardBrokenIdentity = useCallback(async () => {
    const activeId = getActiveIdentityId();
    if (activeId) await removeIdentity(activeId);
    await logoutAnonymous().catch(() => {});
    setSession(null);
    setError(null);
    setStatus("needs-identity");
  }, []);

  const setConversationStatus = useCallback((newStatus: SessionState["conversationStatus"]) => {
    setSession((prev) => (prev ? { ...prev, conversationStatus: newStatus } : prev));
  }, []);

  return (
    <Ctx.Provider
      value={{
        status,
        session,
        error,
        createNewIdentity,
        continueWithStoredIdentity,
        importFromRecoveryPhrase,
        logout,
        deleteIdentity,
        discardBrokenIdentity,
        setConversationStatus,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAnonymousSession(): AnonymousSessionContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAnonymousSession must be used within AnonymousSessionProvider");
  return ctx;
}
