import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encryptBlob } from "@termine/crypto";
import type { MessageDto, ServerWsEvent } from "@termine/shared";
import { attachmentUrl, deleteMessage, editMessage, getMessages, markRead, sendMessage, setReaction, clearReaction } from "../api/conversation.js";
import { ApiError } from "../api/client.js";
import { useAnonymousSession } from "../context/AnonymousSessionContext.js";
import { useSite } from "../context/SiteContext.js";
import { useRealtimeSocket } from "../hooks/useRealtimeSocket.js";
import { Composer } from "../components/chat/Composer.js";
import { ConnectionBanner } from "../components/chat/ConnectionBanner.js";
import { MessageBubble } from "../components/chat/MessageBubble.js";
import { TypingIndicator } from "../components/chat/TypingIndicator.js";
import { FullScreenLoader } from "../components/common/Loader.js";
import {
  decryptMessageText,
  encryptAttachmentMeta,
  encryptMessageText,
  encryptReaction,
  getConversationKey,
  toBlobPart,
} from "../crypto/conversationCrypto.js";
import type { DisplayMessage } from "../components/chat/types.js";

export default function Chat() {
  // Chat only ever mounts once PublicApp has confirmed both are resolved
  // (status === "ready" and site is loaded) - asserted here rather than
  // early-returned so every hook below stays unconditional.
  const { session: activeSession, setConversationStatus, logout } = useAnonymousSession();
  const { site: activeSite } = useSite();
  const session = activeSession!;
  const site = activeSite!;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const [editing, setEditing] = useState<DisplayMessage | null>(null);
  const [adminOnline, setAdminOnline] = useState<boolean | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFilesRef = useRef<Map<string, { text: string; files: File[]; replyToId: string | null }>>(new Map());

  const conversationKey = useMemo(
    () => getConversationKey(session.identity, session.adminPublicKeys.exchangePublicKey, session.conversationId),
    [session],
  );

  const decryptDto = useCallback(
    (dto: MessageDto): DisplayMessage => ({
      id: dto.id,
      senderType: dto.senderType,
      text: dto.content ? decryptMessageText(conversationKey, dto.content) : "",
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

  const loadAllMessages = useCallback(async () => {
    const all: MessageDto[] = [];
    let cursor: string | undefined;
    do {
      const page = await getMessages(cursor);
      all.push(...page.messages);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return all;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    loadAllMessages()
      .then((all) => {
        if (cancelled) return;
        setMessages(all.map(decryptDto));
        const lastAdmin = [...all].reverse().find((m) => m.senderType === "ADMIN");
        if (lastAdmin && !lastAdmin.readAt) markRead(lastAdmin.id).catch(() => {});
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAllMessages, decryptDto]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleWsEvent = useCallback(
    (event: ServerWsEvent) => {
      switch (event.type) {
        case "message.created": {
          const dto = decryptDto(event.message);
          setMessages((prev) => {
            if (prev.some((m) => m.id === dto.id)) return prev;
            return [...prev, dto].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          });
          if (event.message.senderType === "ADMIN") markRead(event.message.id).catch(() => {});
          break;
        }
        case "message.updated": {
          const dto = decryptDto(event.message);
          setMessages((prev) => prev.map((m) => (m.id === dto.id ? dto : m)));
          break;
        }
        case "message.deleted": {
          setMessages((prev) => prev.map((m) => (m.id === event.messageId ? { ...m, deleted: true, text: "" } : m)));
          break;
        }
        case "reaction.updated": {
          setMessages((prev) => prev.map((m) => (m.id === event.messageId ? { ...m, reactions: event.reactions } : m)));
          break;
        }
        case "conversation.read": {
          setMessages((prev) =>
            prev.map((m) =>
              m.senderType === event.senderType && !m.readAt && m.createdAt <= event.readAt ? { ...m, readAt: event.readAt } : m,
            ),
          );
          break;
        }
        case "conversation.updated": {
          setConversationStatus(event.conversation.status);
          break;
        }
        case "typing": {
          if (event.from === "ADMIN") {
            setAdminTyping(event.isTyping);
            clearTimeout(typingTimeoutRef.current);
            if (event.isTyping) typingTimeoutRef.current = setTimeout(() => setAdminTyping(false), 6000);
          }
          break;
        }
        case "presence": {
          setAdminOnline(event.online);
          break;
        }
      }
    },
    [decryptDto, setConversationStatus],
  );

  const handleReconnected = useCallback(() => {
    loadAllMessages().then((all) => setMessages(all.map(decryptDto)));
  }, [loadAllMessages, decryptDto]);

  const { status: wsStatus, send: wsSend } = useRealtimeSocket(handleWsEvent, true, handleReconnected);

  function handleTypingChange(isTyping: boolean) {
    wsSend({ type: isTyping ? "typing.start" : "typing.stop" });
  }

  async function performSend(localId: string, text: string, files: File[], replyToId: string | null) {
    try {
      const attachments = await Promise.all(
        files.map(async (file) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const encryptedBlob = encryptBlob(conversationKey, bytes);
          const meta = encryptAttachmentMeta(conversationKey, {
            filename: file.name,
            mimetype: file.type || "application/octet-stream",
            size: file.size,
          });
          return { meta, blob: new Blob([toBlobPart(encryptedBlob)]) };
        }),
      );
      const payload = encryptMessageText(conversationKey, text);
      const dto = await sendMessage({ content: payload, replyToId, attachments });
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== localId);
        // The WebSocket push for this same message can arrive before this
        // REST response does - if it already landed, just drop the
        // optimistic placeholder instead of adding a second copy.
        if (withoutOptimistic.some((m) => m.id === dto.id)) return withoutOptimistic;
        return [...withoutOptimistic, decryptDto(dto)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      pendingFilesRef.current.delete(localId);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === localId ? { ...m, status: "failed", failureReason: err instanceof ApiError ? err.message : "Failed to send" } : m,
        ),
      );
    }
  }

  function handleSend(text: string, files: File[]) {
    wsSend({ type: "typing.stop" });

    if (editing) {
      const messageId = editing.id;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text, status: "sending" } : m)));
      setEditing(null);
      editMessage(messageId, encryptMessageText(conversationKey, text))
        .then((dto) => setMessages((prev) => prev.map((m) => (m.id === messageId ? decryptDto(dto) : m))))
        .catch((err) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status: "failed", failureReason: err instanceof ApiError ? err.message : "Edit failed" } : m)),
          ),
        );
      return;
    }

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const replyToId = replyTo?.id ?? null;
    const optimistic: DisplayMessage = {
      id: localId,
      senderType: "USER",
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
    pendingFilesRef.current.set(localId, { text, files, replyToId });
    setReplyTo(null);
    void performSend(localId, text, files, replyToId);
  }

  function handleRetry(message: DisplayMessage) {
    const pending = pendingFilesRef.current.get(message.id);
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, status: "sending" } : m)));
    void performSend(message.id, pending?.text ?? message.text, pending?.files ?? [], pending?.replyToId ?? message.replyToId);
  }

  async function handleDelete(message: DisplayMessage) {
    if (!confirm("Delete this message? This can't be undone.")) return;
    try {
      await deleteMessage(message.id);
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, deleted: true, text: "" } : m)));
    } catch {
      // no-op: message remains as-is, user can retry
    }
  }

  async function handleReact(message: DisplayMessage, emoji: string | null) {
    try {
      if (emoji === null) await clearReaction(message.id);
      else await setReaction(message.id, encryptReaction(conversationKey, emoji));
    } catch {
      // best-effort; the reaction UI reconciles from the next WS event or refresh
    }
  }

  const isBlocked = session.conversationStatus === "BLOCKED";
  const canEdit = (message: DisplayMessage) => {
    if (!site.limits.messageEditWindowMinutes) return false;
    const ageMs = Date.now() - new Date(message.createdAt).getTime();
    return ageMs <= site.limits.messageEditWindowMinutes * 60_000;
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {site.avatarUrl && <img src={site.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />}
          <div>
            <p className="text-sm font-semibold leading-tight">{site.displayName}</p>
            {site.presenceEnabled && adminOnline !== null && (
              <p className="text-xs leading-tight text-[var(--text-muted)]">{adminOnline ? "Online" : "Offline"}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-mono">#{session.publicId}</span>
          <button type="button" onClick={() => logout()} className="text-xs text-[var(--text-muted)] underline">
            Switch identity
          </button>
        </div>
      </header>

      <ConnectionBanner status={wsStatus} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loadingHistory ? (
          <FullScreenLoader label="Loading your conversation…" />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-[var(--text-muted)]">
            <p>Start the conversation. Send a message below.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.senderType === "USER"}
                conversationKey={conversationKey}
                attachmentUrlFor={attachmentUrl}
                canEdit={canEdit(message)}
                disableActions={isBlocked}
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
        {adminTyping && <TypingIndicator label={`${site.displayName} is typing…`} />}
        <div ref={bottomRef} />
      </div>

      <Composer
        maxLength={site.limits.maxMessageLength}
        maxAttachments={site.limits.maxAttachmentsPerMessage}
        disabled={isBlocked}
        disabledReason={isBlocked ? "You can no longer send messages in this conversation." : undefined}
        replyPreview={replyTo?.text}
        onCancelReply={() => setReplyTo(null)}
        editingPreview={editing ? "editing message" : undefined}
        initialText={editing?.text}
        onCancelEdit={() => setEditing(null)}
        onSend={handleSend}
        onTypingChange={handleTypingChange}
      />
    </div>
  );
}
