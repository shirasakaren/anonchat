import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encryptBlob } from "@termine/crypto";
import type { ConversationDto, MessageDto, ServerWsEvent } from "@termine/shared";
import {
  archiveConversation,
  blockConversation,
  deleteAdminMessage,
  editAdminMessage,
  getAdminConversation,
  getAdminMessages,
  markAdminRead,
  permanentlyDeleteConversation,
  sendAdminMessage,
  setAdminReaction,
  clearAdminReaction,
  softDeleteConversation,
  unarchiveConversation,
  unblockConversation,
  adminAttachmentUrl,
} from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { useSite } from "../../context/SiteContext.js";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket.js";
import { Composer } from "../../components/chat/Composer.js";
import { ConnectionBanner } from "../../components/chat/ConnectionBanner.js";
import { MessageBubble } from "../../components/chat/MessageBubble.js";
import { TypingIndicator } from "../../components/chat/TypingIndicator.js";
import { FullScreenLoader } from "../../components/common/Loader.js";
import {
  decryptMessageText,
  encryptAttachmentMeta,
  encryptMessageText,
  encryptReaction,
  getConversationKey,
  toBlobPart,
} from "../../crypto/conversationCrypto.js";
import type { DisplayMessage } from "../../components/chat/types.js";
import { CannedReplyPicker } from "./CannedReplyPicker.js";

interface Props {
  conversationId: string;
  onChanged: () => void;
}

export function ConversationView({ conversationId, onChanged }: Props) {
  const { identity } = useAdminSession();
  const { site } = useSite();
  const [conversation, setConversation] = useState<ConversationDto | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const [editing, setEditing] = useState<DisplayMessage | null>(null);
  const [userTyping, setUserTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef<Map<string, { text: string; files: File[]; replyToId: string | null }>>(new Map());

  const conversationKey = useMemo(() => {
    if (!identity || !conversation) return null;
    return getConversationKey(identity, conversation.anonymousExchangePublicKey, conversation.id);
  }, [identity, conversation]);

  const decryptDto = useCallback(
    (dto: MessageDto): DisplayMessage => ({
      id: dto.id,
      senderType: dto.senderType,
      text: dto.content && conversationKey ? decryptMessageText(conversationKey, dto.content) : "",
      replyToId: dto.replyToId,
      attachments: dto.attachments,
      reactions: dto.reactions,
      edited: dto.edited,
      deleted: dto.deleted,
      createdAt: dto.createdAt,
      readAt: dto.readAt,
      status: "sent",
    }),
    [conversationKey],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const conv = await getAdminConversation(conversationId);
      setConversation(conv);
      const all: MessageDto[] = [];
      let cursor: string | undefined;
      do {
        const page = await getAdminMessages(conversationId, cursor);
        all.push(...page.messages);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      const key = identity ? getConversationKey(identity, conv.anonymousExchangePublicKey, conv.id) : null;
      setMessages(
        all.map((dto) => ({
          id: dto.id,
          senderType: dto.senderType,
          text: dto.content && key ? decryptMessageText(key, dto.content) : "",
          replyToId: dto.replyToId,
          attachments: dto.attachments,
          reactions: dto.reactions,
          edited: dto.edited,
          deleted: dto.deleted,
          createdAt: dto.createdAt,
          readAt: dto.readAt,
          status: "sent" as const,
        })),
      );
      const lastUser = [...all].reverse().find((m) => m.senderType === "USER");
      if (lastUser && !lastUser.readAt) markAdminRead(conversationId, lastUser.id).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [conversationId, identity]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleWsEvent = useCallback(
    (event: ServerWsEvent) => {
      const belongsHere = (id: string) => id === conversationId;
      switch (event.type) {
        case "message.created":
          if (!belongsHere(event.conversationId)) return;
          setMessages((prev) => {
            const dto = decryptDto(event.message);
            if (prev.some((m) => m.id === dto.id)) return prev;
            return [...prev, dto].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
          if (event.message.senderType === "USER") markAdminRead(conversationId, event.message.id).catch(() => {});
          onChanged();
          break;
        case "message.updated":
          if (!belongsHere(event.conversationId)) return;
          setMessages((prev) => prev.map((m) => (m.id === event.message.id ? decryptDto(event.message) : m)));
          break;
        case "message.deleted":
          if (!belongsHere(event.conversationId)) return;
          setMessages((prev) => prev.map((m) => (m.id === event.messageId ? { ...m, deleted: true, text: "" } : m)));
          break;
        case "reaction.updated":
          if (!belongsHere(event.conversationId)) return;
          setMessages((prev) => prev.map((m) => (m.id === event.messageId ? { ...m, reactions: event.reactions } : m)));
          break;
        case "conversation.read":
          if (!belongsHere(event.conversationId)) return;
          setMessages((prev) =>
            prev.map((m) => (m.senderType === event.senderType && !m.readAt && m.createdAt <= event.readAt ? { ...m, readAt: event.readAt } : m)),
          );
          break;
        case "conversation.updated":
          if (event.conversation.id === conversationId) setConversation(event.conversation);
          onChanged();
          break;
        case "typing":
          if (belongsHere(event.conversationId) && event.from === "USER") {
            setUserTyping(event.isTyping);
            clearTimeout(typingTimeoutRef.current);
            if (event.isTyping) typingTimeoutRef.current = setTimeout(() => setUserTyping(false), 6000);
          }
          break;
      }
    },
    [conversationId, decryptDto, onChanged],
  );

  const { status: wsStatus, send: wsSend } = useRealtimeSocket(handleWsEvent, true, load);

  if (loading || !conversation) return <FullScreenLoader label="Loading conversation…" />;
  if (!conversationKey) return <FullScreenLoader label="Unlocking…" />;

  async function performSend(localId: string, text: string, files: File[], replyToId: string | null) {
    try {
      const attachments = await Promise.all(
        files.map(async (file) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const encryptedBlob = encryptBlob(conversationKey!, bytes);
          const meta = encryptAttachmentMeta(conversationKey!, { filename: file.name, mimetype: file.type || "application/octet-stream", size: file.size });
          return { meta, blob: new Blob([toBlobPart(encryptedBlob)]) };
        }),
      );
      const payload = encryptMessageText(conversationKey!, text);
      const dto = await sendAdminMessage(conversationId, { content: payload, replyToId, attachments });
      setMessages((prev) => prev.map((m) => (m.id === localId ? decryptDto(dto) : m)));
      pendingRef.current.delete(localId);
      onChanged();
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, status: "failed", failureReason: err instanceof ApiError ? err.message : "Failed" } : m)));
    }
  }

  function handleSend(text: string, files: File[]) {
    wsSend({ type: "typing.stop", conversationId });

    if (editing) {
      const messageId = editing.id;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text, status: "sending" } : m)));
      setEditing(null);
      editAdminMessage(conversationId, messageId, encryptMessageText(conversationKey!, text))
        .then((dto) => setMessages((prev) => prev.map((m) => (m.id === messageId ? decryptDto(dto) : m))))
        .catch((err) => setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status: "failed", failureReason: err instanceof ApiError ? err.message : "Edit failed" } : m))));
      return;
    }

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const replyToId = replyTo?.id ?? null;
    const optimistic: DisplayMessage = {
      id: localId,
      senderType: "ADMIN",
      text,
      replyToId,
      attachments: [],
      reactions: [],
      edited: false,
      deleted: false,
      createdAt: new Date().toISOString(),
      readAt: null,
      status: "sending",
    };
    setMessages((prev) => [...prev, optimistic]);
    pendingRef.current.set(localId, { text, files, replyToId });
    setReplyTo(null);
    void performSend(localId, text, files, replyToId);
  }

  function handleRetry(message: DisplayMessage) {
    const pending = pendingRef.current.get(message.id);
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, status: "sending" } : m)));
    void performSend(message.id, pending?.text ?? message.text, pending?.files ?? [], pending?.replyToId ?? message.replyToId);
  }

  async function handleDelete(message: DisplayMessage) {
    if (!confirm("Delete this message?")) return;
    await deleteAdminMessage(conversationId, message.id).catch(() => {});
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, deleted: true, text: "" } : m)));
  }

  async function handleReact(message: DisplayMessage, emoji: string | null) {
    try {
      if (emoji === null) await clearAdminReaction(conversationId, message.id);
      else await setAdminReaction(conversationId, message.id, encryptReaction(conversationKey!, emoji));
    } catch {
      // best-effort
    }
  }

  async function handleArchiveToggle() {
    const updated = conversation!.status === "ARCHIVED" ? await unarchiveConversation(conversationId) : await archiveConversation(conversationId);
    setConversation(updated);
    onChanged();
  }

  async function handleBlockToggle() {
    const updated = conversation!.status === "BLOCKED" ? await unblockConversation(conversationId) : await blockConversation(conversationId);
    setConversation(updated);
    onChanged();
  }

  async function handleSoftDelete() {
    if (!confirm("Move this conversation to trash? You can still permanently delete it later.")) return;
    await softDeleteConversation(conversationId);
    onChanged();
  }

  async function handlePermanentDelete() {
    if (!confirm("Permanently delete this conversation and all its messages? This cannot be undone.")) return;
    await permanentlyDeleteConversation(conversationId);
    onChanged();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold">Anonymous #{conversation.publicId}</p>
          <p className="text-xs text-[var(--text-muted)]">{conversation.status}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleArchiveToggle} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs">
            {conversation.status === "ARCHIVED" ? "Unarchive" : "Archive"}
          </button>
          <button type="button" onClick={handleBlockToggle} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs">
            {conversation.status === "BLOCKED" ? "Unblock" : "Block"}
          </button>
          <button type="button" onClick={handleSoftDelete} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-red-500">
            Delete
          </button>
          <button type="button" onClick={handlePermanentDelete} className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-500">
            Delete permanently
          </button>
        </div>
      </header>

      <ConnectionBanner status={wsStatus} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">No messages yet.</div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.senderType === "ADMIN"}
                conversationKey={conversationKey}
                attachmentUrlFor={(id) => adminAttachmentUrl(conversationId, id)}
                canEdit={site ? Date.now() - new Date(message.createdAt).getTime() <= site.limits.messageEditWindowMinutes * 60_000 : false}
                replyPreview={message.replyToId ? messages.find((m) => m.id === message.replyToId)?.text : undefined}
                onReply={() => setReplyTo(message)}
                onEdit={() => setEditing(message)}
                onDelete={() => handleDelete(message)}
                onReact={(emoji) => handleReact(message, emoji)}
                onRetry={() => handleRetry(message)}
              />
            ))}
          </div>
        )}
        {userTyping && <TypingIndicator label="Typing…" />}
        <div ref={bottomRef} />
      </div>

      <CannedReplyPicker onPick={(body) => handleSend(body, [])} />

      <Composer
        maxLength={site?.limits.maxMessageLength ?? 8000}
        maxAttachments={site?.limits.maxAttachmentsPerMessage ?? 5}
        disabled={false}
        replyPreview={replyTo?.text}
        onCancelReply={() => setReplyTo(null)}
        editingPreview={editing ? "editing message" : undefined}
        initialText={editing?.text}
        onCancelEdit={() => setEditing(null)}
        onSend={handleSend}
        onTypingChange={(isTyping) => wsSend({ type: isTyping ? "typing.start" : "typing.stop", conversationId })}
      />
    </div>
  );
}
