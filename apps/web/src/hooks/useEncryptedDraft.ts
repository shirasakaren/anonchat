import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  clearEncryptedDraftIfMatches,
  loadEncryptedDraft,
  saveEncryptedDraft,
  type DraftRole,
} from "../crypto/encryptedDrafts.js";

const SAVE_DELAY_MS = 300;

export function useEncryptedDraft(role: DraftRole, conversationId: string, conversationKey: Uint8Array | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);
  const draftText = useMemo(
    () => (conversationKey ? loadEncryptedDraft(role, conversationId, conversationKey) : ""),
    [conversationId, conversationKey, role],
  );

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (pendingRef.current === null || !conversationKey) return;
    saveEncryptedDraft(role, conversationId, conversationKey, pendingRef.current);
    pendingRef.current = null;
  }, [conversationId, conversationKey, role]);

  useEffect(() => flush, [flush]);

  const updateDraft = useCallback(
    (text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current = text;
      timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  const clearIfMatches = useCallback(
    (sentText: string) => {
      // If another message is already being composed while the previous
      // send resolves, persist that newer text before comparing storage.
      flush();
      if (!conversationKey) return;
      clearEncryptedDraftIfMatches(role, conversationId, conversationKey, sentText);
    },
    [conversationId, conversationKey, flush, role],
  );

  return { draftText, updateDraft, clearIfMatches };
}
