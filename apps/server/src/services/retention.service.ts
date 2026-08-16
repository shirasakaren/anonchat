import { prisma } from "../db.js";
import { getStorageAdapter } from "../storage/index.js";
import { evictCachedBlob } from "../utils/blobCache.js";
import { publishToConversation } from "../realtime/hub.js";

/**
 * Disappearing messages (WhatsApp-style). Opt-in, conversation-level
 * metadata set by either participant (see the retention schema in
 * @anonchat/shared) - a change applies to the whole conversation, so the
 * admin uses the visitor's setting and can change it themselves. The
 * server applies it without ever reading message content: deletion here is
 * row/storage cleanup of ciphertext, so the E2EE property is untouched.
 *
 * New messages get an expiry TTL from send time; the sweep below deletes
 * them once it passes. The optional on-logout wipe purges the whole
 * conversation when the visitor logs out.
 */

const SWEEP_INTERVAL_MS = 10 * 60_000;

interface MessageRow {
  id: string;
  attachments: { storageKey: string }[];
}

async function deleteMessagesWithStorage(rows: MessageRow[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const storage = getStorageAdapter();
  const storageKeys = rows.flatMap((m) => m.attachments.map((a) => a.storageKey));
  storageKeys.forEach(evictCachedBlob);
  await Promise.allSettled(storageKeys.map((key) => storage.delete(key)));
  // Deleting the message rows cascades to their attachment/reaction rows.
  await prisma.message.deleteMany({ where: { id: { in: rows.map((m) => m.id) } } });
  return rows.map((m) => m.id);
}

function publishDeleted(conversationId: string, messageIds: string[]): void {
  if (messageIds.length === 0) return;
  publishToConversation(conversationId, { type: "messages.deleted", conversationId, messageIds });
}

/** Deletes every message in the conversation (attachments included) and
 *  broadcasts one bulk event. Used by the disappear-on-logout wipe. */
export async function purgeAllMessages(conversationId: string): Promise<void> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    select: { id: true, attachments: { select: { storageKey: true } } },
  });
  const deletedIds = await deleteMessagesWithStorage(rows);
  publishDeleted(conversationId, deletedIds);
}

/** Sweeps one conversation's expired disappearing messages and returns how
 *  many were deleted. */
export async function sweepConversation(conversationId: string): Promise<number> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { disappearingEnabled: true, disappearingSeconds: true },
  });
  if (!conversation || !conversation.disappearingEnabled || !conversation.disappearingSeconds) return 0;

  const rows = await prisma.message.findMany({
    where: { conversationId, expiresAt: { lte: new Date() } },
    select: { id: true, attachments: { select: { storageKey: true } } },
  });
  const deletedIds = await deleteMessagesWithStorage(rows);
  publishDeleted(conversationId, deletedIds);
  return deletedIds.length;
}

let sweepTimerStarted = false;

/** Hourly-ish sweep across every conversation with disappearing messages
 *  enabled. Also runs once at boot (import side effect) so a restart
 *  doesn't extend expiry windows. */
export function startRetentionSweep(): void {
  if (sweepTimerStarted) return;
  sweepTimerStarted = true;

  const sweep = async () => {
    try {
      const conversations = await prisma.conversation.findMany({
        where: { disappearingEnabled: true },
        select: { id: true },
      });
      for (const conversation of conversations) {
        await sweepConversation(conversation.id);
      }
    } catch (error) {
      // A failed sweep must not crash the process; the next tick retries.
      // eslint-disable-next-line no-console
      console.error("retention sweep failed", error);
    }
  };

  void sweep();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS).unref();
}
