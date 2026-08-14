import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encryptBlob } from "@anonchat/crypto";
import type { MessageDto, ServerWsEvent } from "@anonchat/shared";
import {
  attachmentUrl,
  deleteMessage,
  editMessage,
  getMessages,
  markRead,
  sendMessage,
  setReaction,
  clearReaction,
} from "../api/conversation.js";
import { ApiError } from "../api/client.js";
import { useAnonymousSession } from "../context/AnonymousSessionContext.js";
import { useSite } from "../context/SiteContext.js";
import { useTheme } from "../context/ThemeContext.js";
import { useRealtimeSocket } from "../hooks/useRealtimeSocket.js";
import { Composer } from "../components/chat/Composer.js";
import { ConnectionBanner } from "../components/chat/ConnectionBanner.js";
import { DateSeparator } from "../components/chat/DateSeparator.js";
import { withDateSeparators } from "../components/chat/dateSeparators.js";
import { DeleteMessageModal } from "../components/chat/DeleteMessageModal.js";
import { getLocallyDeletedMessageIds, hideMessageLocally } from "../components/chat/locallyDeletedMessages.js";
import { MessageBubble } from "../components/chat/MessageBubble.js";
import { NotificationEmailPrompt } from "../components/chat/NotificationEmailPrompt.js";
import { PushBellButton } from "../components/chat/PushBellButton.js";
import { ExpandableProse } from "../components/chat/ExpandableProse.js";
import { renderMessageMarkdown } from "../components/chat/markdown.js";
import {
  dismissNotificationEmailPrompt,
  isNotificationEmailPromptDismissed,
} from "../components/chat/notificationEmailPromptDismissed.js";
import { TypingIndicator } from "../components/chat/TypingIndicator.js";
import { DefaultAvatar } from "../components/common/DefaultAvatar.js";
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
  const { syncFromServer } = useTheme();
  const session = activeSession!;
  const site = activeSite!;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const [editing, setEditing] = useState<DisplayMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DisplayMessage | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getLocallyDeletedMessageIds(session.conversationId));
  const [adminOnline, setAdminOnline] = useState<boolean | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFilesRef = useRef<Map<string, { text: string; files: File[]; replyToId: string | null }>>(new Map());

  const conversationKey = useMemo(
    () => getConversationKey(session.identity, session.adminPublicKeys.exchangePublicKey, session.conversationId),
    [session],
  );
  const welcomeHtml = useMemo(() => renderMessageMarkdown(site.welcomeMessage), [site.welcomeMessage]);

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
              m.senderType === event.senderType && !m.readAt && m.createdAt <= event.readAt
                ? { ...m, readAt: event.readAt }
                : m,
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
        case "site.updated": {
          syncFromServer(event.theme);
          break;
        }
      }
    },
    [decryptDto, setConversationStatus, syncFromServer],
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
      // Captured before the update below - zero USER messages so far means
      // this send is about to become the first one ever, which is exactly
      // when the optional "email me on reply" prompt should appear (see
      // NotificationEmailPrompt.tsx). Computed outside the setMessages
      // updater since triggering another state update from inside one is
      // the kind of side effect React's updater functions should stay free of.
      const isFirstUserMessage = !messages.some((m) => m.senderType === "USER");

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
      if (isFirstUserMessage && !isNotificationEmailPromptDismissed(session.conversationId)) {
        setShowNotificationPrompt(true);
      }
      pendingFilesRef.current.delete(localId);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === localId
            ? { ...m, status: "failed", failureReason: err instanceof ApiError ? err.message : "Failed to send" }
            : m,
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
    void performSend(
      message.id,
      pending?.text ?? message.text,
      pending?.files ?? [],
      pending?.replyToId ?? message.replyToId,
    );
  }

  function handleDeleteForMe(message: DisplayMessage) {
    hideMessageLocally(session.conversationId, message.id);
    setHiddenIds((prev) => new Set(prev).add(message.id));
    setDeleteTarget(null);
  }

  async function handleDeleteForEveryone(message: DisplayMessage) {
    setDeleteTarget(null);
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

  // Hiding is filtered in at render time, never by dropping rows from
  // `messages` itself - that array is the source of truth reply previews
  // look up against (messages.find(m => m.id === replyToId)), and gets
  // rebuilt wholesale on every reconnect/refetch, so a locally-hidden
  // message would just silently reappear next reload if it were removed
  // from there instead.
  const visibleMessages = useMemo(() => messages.filter((m) => !hiddenIds.has(m.id)), [messages, hiddenIds]);
  const threadItems = useMemo(() => withDateSeparators(visibleMessages), [visibleMessages]);

  // Only the single most-recently-read own message should show "Read" -
  // find its id once per messages change rather than inside MessageBubble
  // (which only ever sees one message at a time).
  const lastReadOwnMessageId = useMemo(() => {
    let id: string | null = null;
    for (const m of messages) {
      if (m.senderType === "USER" && !m.deleted && m.status === "sent" && m.readAt) id = m.id;
    }
    return id;
  }, [messages]);

  const isBlocked = session.conversationStatus === "BLOCKED";
  const canEdit = (message: DisplayMessage) => {
    if (!site.limits.messageEditWindowMinutes) return false;
    const ageMs = Date.now() - new Date(message.createdAt).getTime();
    return ageMs <= site.limits.messageEditWindowMinutes * 60_000;
  };

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {site.avatarUrl ? (
            <img src={site.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <DefaultAvatar name={site.displayName} className="h-8 w-8 text-sm" />
          )}
          <div>
            <h1 className="text-sm font-semibold leading-tight">{site.displayName}</h1>
            {site.presenceEnabled && adminOnline !== null && (
              <p className="text-xs leading-tight text-[var(--text-muted)]">{adminOnline ? "Online" : "Offline"}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PushBellButton vapidPublicKey={site.vapidPublicKey} />
          <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-mono">
            #{session.publicId}
          </span>
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
          <div className="flex h-full items-center justify-center px-4">
            <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2.5">
                {site.avatarUrl ? (
                  <img src={site.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <DefaultAvatar name={site.displayName} className="h-9 w-9 text-sm" />
                )}
                <div>
                  <p className="text-sm font-semibold">{site.displayName}</p>
                  <p className="text-xs text-[var(--text-muted)]">Welcome message</p>
                </div>
              </div>
              {welcomeHtml ? (
                <ExpandableProse html={welcomeHtml} clamp={false} />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Send a message below to start the conversation.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {threadItems.map((item) =>
              item.kind === "separator" ? (
                <DateSeparator key={item.key} label={item.label} />
              ) : (
                <MessageBubble
                  key={item.key}
                  message={item.message}
                  isOwn={item.message.senderType === "USER"}
                  conversationKey={conversationKey}
                  attachmentUrlFor={attachmentUrl}
                  canEdit={canEdit(item.message)}
                  disableActions={isBlocked}
                  showReadReceipt={item.message.id === lastReadOwnMessageId}
                  replyPreview={
                    item.message.replyToId ? messages.find((m) => m.id === item.message.replyToId)?.text : undefined
                  }
                  onReply={() => setReplyTo(item.message)}
                  onEdit={() => setEditing(item.message)}
                  onDelete={() => setDeleteTarget(item.message)}
                  onReact={(emoji) => handleReact(item.message, emoji)}
                  onRetry={() => handleRetry(item.message)}
                />
              ),
            )}
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

      {deleteTarget && (
        <DeleteMessageModal
          onDeleteForMe={() => handleDeleteForMe(deleteTarget)}
          onDeleteForEveryone={() => void handleDeleteForEveryone(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showNotificationPrompt && (
        <NotificationEmailPrompt
          adminName={site.displayName}
          onDone={() => {
            dismissNotificationEmailPrompt(session.conversationId);
            setShowNotificationPrompt(false);
          }}
        />
      )}
    </main>
  );
}
