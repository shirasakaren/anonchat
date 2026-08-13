import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { encryptBlob } from "@anonchat/crypto";
import { Pencil } from "lucide-react";
import type { AdminConversationDto, MessageDto, ServerWsEvent } from "@anonchat/shared";
import {
  deleteAdminMessage,
  editAdminMessage,
  getAdminConversation,
  getAdminMessages,
  markAdminRead,
  sendAdminMessage,
  setAdminReaction,
  clearAdminReaction,
  updateConversationAlias,
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
  const [conversation, setConversation] = useState<AdminConversationDto | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const [editing, setEditing] = useState<DisplayMessage | null>(null);
  const [userTyping, setUserTyping] = useState(false);
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);
  const [userOnline, setUserOnline] = useState(false);
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

  const fetchConversation = useCallback(async () => {
    const conv = await getAdminConversation(conversationId);
    setConversation(conv);
    setUserOnline(conv.userOnline);
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
  }, [conversationId, identity]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await fetchConversation();
    } finally {
      setLoading(false);
    }
  }, [fetchConversation]);

  // Used for socket-reconnect catch-up: re-fetches in the background without
  // flipping `loading`, so a brief network blip doesn't blank the already-
  // rendered conversation back to a full-screen loader.
  const reloadSilently = useCallback(() => {
    fetchConversation().catch(() => {});
  }, [fetchConversation]);

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
          // Keep the header's "Last seen" line current as messages land.
          setConversation((prev) => (prev ? { ...prev, lastMessageAt: event.message.createdAt } : prev));
          setMessages((prev) => {
            const dto = decryptDto(event.message);
            if (prev.some((m) => m.id === dto.id)) return prev;
            return [...prev, dto].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
          // Only bump the sidebar for genuinely new inbound messages - the
          // admin's own message already triggers onChanged() once the REST
          // send completes (performSend below), so doing it again here for
          // the socket echo of that same message just double-fires it.
          if (event.message.senderType === "USER") {
            markAdminRead(conversationId, event.message.id).catch(() => {});
            onChanged();
          }
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
            prev.map((m) =>
              m.senderType === event.senderType && !m.readAt && m.createdAt <= event.readAt
                ? { ...m, readAt: event.readAt }
                : m,
            ),
          );
          break;
        case "conversation.updated":
          // Was unconditionally bumping the sidebar for ANY conversation's
          // update, even ones this admin wasn't currently viewing.
          if (event.conversation.id !== conversationId) return;
          // The broadcast payload is the user-safe DTO without the
          // admin-private fields - carry them forward so they aren't wiped
          // by this (or any other) conversation update.
          setConversation((prev) =>
            prev
              ? {
                  ...event.conversation,
                  adminAlias: prev.adminAlias,
                  mutedAt: prev.mutedAt,
                  userOnline: prev.userOnline,
                }
              : prev,
          );
          onChanged();
          break;
        case "user.presence":
          if (event.conversationId !== conversationId) return;
          setUserOnline(event.online);
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

  const { status: wsStatus, send: wsSend } = useRealtimeSocket(handleWsEvent, true, reloadSilently);

  if (loading || !conversation) return <FullScreenLoader label="Loading conversation…" />;
  if (!conversationKey) return <FullScreenLoader label="Unlocking…" />;

  async function performSend(localId: string, text: string, files: File[], replyToId: string | null) {
    try {
      const attachments = await Promise.all(
        files.map(async (file) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const encryptedBlob = encryptBlob(conversationKey!, bytes);
          const meta = encryptAttachmentMeta(conversationKey!, {
            filename: file.name,
            mimetype: file.type || "application/octet-stream",
            size: file.size,
          });
          return { meta, blob: new Blob([toBlobPart(encryptedBlob)]) };
        }),
      );
      const payload = encryptMessageText(conversationKey!, text);
      const dto = await sendAdminMessage(conversationId, { content: payload, replyToId, attachments });
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== localId);
        // The WebSocket push for this same message can arrive before this
        // REST response does - if it already landed, just drop the
        // optimistic placeholder instead of adding a second copy.
        if (withoutOptimistic.some((m) => m.id === dto.id)) return withoutOptimistic;
        return [...withoutOptimistic, decryptDto(dto)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      pendingRef.current.delete(localId);
      onChanged();
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === localId
            ? { ...m, status: "failed", failureReason: err instanceof ApiError ? err.message : "Failed" }
            : m,
        ),
      );
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
        .catch((err) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, status: "failed", failureReason: err instanceof ApiError ? err.message : "Edit failed" }
                : m,
            ),
          ),
        );
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
    void performSend(
      message.id,
      pending?.text ?? message.text,
      pending?.files ?? [],
      pending?.replyToId ?? message.replyToId,
    );
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

  function startAliasEdit() {
    setAliasDraft(conversation?.adminAlias ?? "");
    setEditingAlias(true);
  }

  async function saveAlias() {
    if (aliasBusy) return;
    setAliasBusy(true);
    try {
      const updated = await updateConversationAlias(conversationId, aliasDraft);
      setConversation(updated);
      onChanged();
    } catch {
      // Leave the previous value in place; the input just closes.
    } finally {
      setAliasBusy(false);
      setEditingAlias(false);
    }
  }

  async function clearAlias() {
    if (aliasBusy) return;
    setAliasBusy(true);
    try {
      const updated = await updateConversationAlias(conversationId, "");
      setConversation(updated);
      onChanged();
    } catch {
      // best-effort
    } finally {
      setAliasBusy(false);
      setEditingAlias(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-col">
            {editingAlias ? (
              <form
                className="flex min-w-0 items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveAlias();
                }}
              >
                <input
                  autoFocus
                  value={aliasDraft}
                  onChange={(e) => setAliasDraft(e.target.value)}
                  onBlur={() => void saveAlias()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditingAlias(false);
                      setAliasDraft(conversation?.adminAlias ?? "");
                    }
                  }}
                  maxLength={60}
                  placeholder="Nickname…"
                  aria-label="Nickname for this conversation"
                  className="w-40 rounded-md border border-[var(--border-strong)] bg-transparent px-2 py-1 text-sm font-semibold"
                />
                <button
                  type="submit"
                  disabled={aliasBusy}
                  onMouseDown={(e) => e.preventDefault()}
                  className="rounded-md bg-[var(--btn-bg)] px-2 py-1 text-xs font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={aliasBusy}
                  onMouseDown={(e) => {
                    // Keep focus in the input so its onBlur save doesn't race
                    // (and win over) the clear action - mousedown fires before
                    // the blur, so preventDefault here stops the blur entirely.
                    e.preventDefault();
                    void clearAlias();
                  }}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-muted)] disabled:opacity-50"
                >
                  Clear
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={startAliasEdit}
                title={conversation.adminAlias ? "Edit nickname" : "Set a nickname for this contact"}
                className="group flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-[var(--surface-muted)]"
              >
                <h2 className="min-w-0 truncate text-sm font-semibold">
                  {conversation.adminAlias || `Anonymous #${conversation.publicId}`}
                </h2>
                <Pencil size={12} aria-hidden className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text)]" />
              </button>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 truncate px-1 text-[11px] text-[var(--text-muted)]">
              {userOnline ? (
                <>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  Online
                </>
              ) : conversation.lastMessageAt ? (
                `Last seen ${formatDistanceToNowStrict(new Date(conversation.lastMessageAt), { addSuffix: true })}`
              ) : (
                "No messages yet"
              )}
            </p>
          </div>
        </div>
      </header>

      <ConnectionBanner status={wsStatus} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            No messages yet.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.senderType === "ADMIN"}
                conversationKey={conversationKey}
                attachmentUrlFor={(id) => adminAttachmentUrl(conversationId, id)}
                canEdit={
                  site
                    ? Date.now() - new Date(message.createdAt).getTime() <=
                      site.limits.messageEditWindowMinutes * 60_000
                    : false
                }
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
