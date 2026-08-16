import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getStorageAdapter } from "../storage/index.js";
import { evictCachedBlob } from "../utils/blobCache.js";
import { isUserOnline, publishToConversation } from "../realtime/hub.js";

/**
 * Disappearing messages and automatic chat deletion. Both are opt-in,
 * conversation-level metadata set by either participant (see the retention
 * schema in @anonchat/shared), and the server applies them without ever
 * reading message content - deletion here is row/storage cleanup of
 * ciphertext, so the E2EE property is untouched.
 *
 * Modes:
 * - Disappearing messages (WhatsApp-style): new messages get an expiry TTL
 *   from send time; the sweep below deletes them once it passes.
 * - DISCONNECT: purge shortly after the visitor's last socket drops
 *   (a short grace period survives a page refresh).
 * - BOTH_READ: purge once every message has been read by its recipient.
 * - AFTER_DAYS: the sweep deletes every message older than N days.
 */

/** Grace period before a DISCONNECT purge - long enough to survive a
 *  browser refresh or a brief network blip, short enough to still feel
 *  like "the chat is gone when the session ends". */
const DISCONNECT_GRACE_MS = 60_000;

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
 *  broadcasts one bulk event. Used by DISCONNECT, BOTH_READ, and
 *  disappear-on-logout. */
export async function purgeAllMessages(conversationId: string): Promise<void> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    select: { id: true, attachments: { select: { storageKey: true } } },
  });
  const deletedIds = await deleteMessagesWithStorage(rows);
  publishDeleted(conversationId, deletedIds);
}

/** Sweeps one conversation according to its current retention settings and
 *  returns how many messages were deleted. */
export async function sweepConversation(conversationId: string): Promise<number> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { autoDeleteMode: true, autoDeleteDays: true, disappearingEnabled: true, disappearingSeconds: true },
  });
  if (!conversation) return 0;

  const orConditions: Prisma.MessageWhereInput[] = [];
  if (conversation.disappearingEnabled && conversation.disappearingSeconds) {
    orConditions.push({ expiresAt: { lte: new Date() } });
  }
  if (conversation.autoDeleteMode === "AFTER_DAYS" && conversation.autoDeleteDays) {
    const cutoff = new Date(Date.now() - conversation.autoDeleteDays * 86_400_000);
    orConditions.push({ createdAt: { lt: cutoff } });
  }
  if (orConditions.length === 0) return 0;

  const rows = await prisma.message.findMany({
    where: { conversationId, OR: orConditions },
    select: { id: true, attachments: { select: { storageKey: true } } },
  });
  const deletedIds = await deleteMessagesWithStorage(rows);
  publishDeleted(conversationId, deletedIds);
  return deletedIds.length;
}

/** DISCONNECT mode: purge a short while after the visitor's last socket
 *  drops, unless they reconnected (or the mode changed) in the meantime. */
export function scheduleDisconnectPurge(conversationId: string): void {
  setTimeout(() => {
    void (async () => {
      if (isUserOnline(conversationId)) return;
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { autoDeleteMode: true },
      });
      if (!conversation || conversation.autoDeleteMode !== "DISCONNECT") return;
      await purgeAllMessages(conversationId);
    })().catch(() => {});
  }, DISCONNECT_GRACE_MS);
}

let sweepTimerStarted = false;

/** Hourly-ish sweep across every conversation with any retention enabled.
 *  Also runs once at boot (import side effect) so a restart doesn't extend
 *  expiry windows. */
export function startRetentionSweep(): void {
  if (sweepTimerStarted) return;
  sweepTimerStarted = true;

  const sweep = async () => {
    try {
      const conversations = await prisma.conversation.findMany({
        where: {
          OR: [{ disappearingEnabled: true }, { autoDeleteMode: { not: "OFF" } }],
        },
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
