import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { encryptBlob } from "@anonchat/crypto";
import { evictAttachmentsOf } from "../../crypto/attachmentCache.js";
import { Info, Pencil, StickyNote } from "lucide-react";
import {
  DEFAULT_MAX_MESSAGE_LENGTH,
  type AdminConversationDto,
  type CannedReplyDto,
  type ConversationNoteDto,
  type MessageDto,
  type ServerWsEvent,
} from "@anonchat/shared";
import {
  deleteAdminMessage,
  editAdminMessage,
  getAdminConversation,
  getAdminMessages,
  listCannedReplies,
  markAdminRead,
  sendAdminMessage,
  setAdminReaction,
  clearAdminReaction,
  updateAdminRetention,
  updateConversationAlias,
  adminAttachmentUrl,
} from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { useSite } from "../../context/SiteContext.js";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket.js";
import { useEncryptedDraft } from "../../hooks/useEncryptedDraft.js";
import { useKeyboardViewport } from "../../hooks/useKeyboardViewport.js";
import { Composer } from "../../components/chat/Composer.js";
import { ConnectionBanner } from "../../components/chat/ConnectionBanner.js";
import { DateSeparator } from "../../components/chat/DateSeparator.js";
import { withDateSeparators } from "../../components/chat/dateSeparators.js";
import { UnreadDivider } from "../../components/chat/UnreadDivider.js";
import { computeUnreadAnchor, getLastSeen, setLastSeen } from "../../components/chat/lastSeen.js";
import { DeleteMessageModal } from "../../components/chat/DeleteMessageModal.js";
import { getLocallyDeletedMessageIds, hideMessageLocally } from "../../components/chat/locallyDeletedMessages.js";
import { MessageBubble } from "../../components/chat/MessageBubble.js";
import { TapMessageHint, useTapMessageHint, useTouchUi } from "../../components/chat/TapMessageHint.js";
import { buildReplyPreviewInfo } from "../../components/chat/replyPreview.js";
import { RetentionPopover } from "../../components/chat/RetentionPopover.js";
import { TypingIndicator } from "../../components/chat/TypingIndicator.js";
import { FullScreenLoader } from "../../components/common/Loader.js";
import { VisitorInsightsDrawer } from "../../components/admin/VisitorInsightsDrawer.js";
import {
  decryptMessageTextWithStatus,
  encryptAttachmentMeta,
  encryptMessageText,
  encryptReaction,
  getConversationKey,
  toBlobPart,
} from "../../crypto/conversationCrypto.js";
import type { DisplayMessage } from "../../components/chat/types.js";
import { resolveFileMimetypeWithBytes } from "../../components/chat/preview/fileSniffing.js";
import {
  createPendingAttachmentPreviews,
  revokePendingAttachmentPreviews,
} from "../../components/chat/PendingAttachmentTransfer.js";
import { useToast } from "../../context/ToastContext.js";

const SharedNoteDrawer = lazy(() => import("../../components/note/SharedNoteDrawer.js"));

interface Props {
  conversationId: string;
  onChanged: () => void;
}

export function ConversationView({ conversationId, onChanged }: Props) {
  const { showToast } = useToast();
  const { identity } = useAdminSession();
  const { site } = useSite();
  const [conversation, setConversation] = useState<AdminConversationDto | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const { showHint: showTapHint, dismissHint } = useTapMessageHint();
  const touchUi = useTouchUi();
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const [editing, setEditing] = useState<DisplayMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DisplayMessage | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getLocallyDeletedMessageIds(conversationId));
  // First message the admin hasn't seen yet on this device - the thread
  // renders an unread divider above it and opens scrolled to it instead of
  // loading from the very top and scrolling through everything.
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null);
  const pendingInitialScrollRef = useRef(false);
  const [userTyping, setUserTyping] = useState(false);
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);
  const [userOnline, setUserOnline] = useState(false);
  const [cannedReplies, setCannedReplies] = useState<CannedReplyDto[]>([]);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [incomingNote, setIncomingNote] = useState<ConversationNoteDto | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef<
    Map<
      string,
      {
        text: string;
        files: File[];
        replyToId: string | null;
        previews: NonNullable<DisplayMessage["pendingAttachments"]>;
      }
    >
  >(new Map());

  useEffect(
    () => () => {
      for (const pending of pendingRef.current.values()) revokePendingAttachmentPreviews(pending.previews);
    },
    [],
  );

  const conversationKey = useMemo(() => {
    if (!identity || !conversation) return null;
    return getConversationKey(identity, conversation.anonymousExchangePublicKey, conversation.id);
  }, [identity, conversation]);

  const draft = useEncryptedDraft("ADMIN", conversationId, conversationKey);

  const decryptDto = useCallback(
    (dto: MessageDto): DisplayMessage => {
      const decrypted =
        dto.content && conversationKey ? decryptMessageTextWithStatus(conversationKey, dto.content) : null;
      return {
        id: dto.id,
        senderType: dto.senderType,
        text: decrypted?.text ?? "",
        decryptionError: decrypted?.error ?? undefined,
        replyToId: dto.replyToId,
        attachments: dto.attachments,
        reactions: dto.reactions,
        edited: dto.edited,
        deleted: dto.deleted,
        createdAt: dto.createdAt,
        readAt: dto.readAt,
        status: "sent",
      };
    },
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
    const decrypted = all.map((dto) => {
      const text = dto.content && key ? decryptMessageTextWithStatus(key, dto.content) : null;
      return {
        id: dto.id,
        senderType: dto.senderType,
        text: text?.text ?? "",
        decryptionError: text?.error ?? undefined,
        replyToId: dto.replyToId,
        attachments: dto.attachments,
        reactions: dto.reactions,
        edited: dto.edited,
        deleted: dto.deleted,
        createdAt: dto.createdAt,
        readAt: dto.readAt,
        status: "sent" as const,
      };
    });
    const lastSeen = getLastSeen("ADMIN", conversationId);
    setUnreadAnchorId(computeUnreadAnchor(decrypted, lastSeen)?.id ?? null);
    setMessages(decrypted);
    const newest = decrypted[decrypted.length - 1];
    if (newest) setLastSeen("ADMIN", conversationId, newest.id, newest.createdAt);
    const lastUser = [...all].reverse().find((m) => m.senderType === "USER");
    if (lastUser && !lastUser.readAt) markAdminRead(conversationId, lastUser.id).catch(() => {});
  }, [conversationId, identity]);

  const load = useCallback(async () => {
    setLoading(true);
    // The next successful fetch (messages + anchor) must re-anchor the
    // scroll. Set here rather than in fetchConversation so silent
    // reconnect refetches - which also call fetchConversation - never
    // yank the admin's view back to the anchor mid-reading.
    pendingInitialScrollRef.current = true;
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
    void load().catch(() => {});
  }, [load]);

  // Fetched once, not per-conversation - canned replies aren't scoped to a
  // single conversation, unlike everything else `load()` re-fetches above.
  useEffect(() => {
    void listCannedReplies()
      .then(setCannedReplies)
      .catch(() => setCannedReplies([]));
  }, []);

  // ConversationView is reused (not remounted) across conversations - Inbox
  // renders it without a `key`, so switching chats only changes this prop.
  // Re-read the per-conversation local-delete registry whenever it does,
  // the same way `load()` above re-fetches everything else for the new id.
  useEffect(() => {
    setHiddenIds(getLocallyDeletedMessageIds(conversationId));
  }, [conversationId]);

  useEffect(() => {
    if (pendingInitialScrollRef.current) {
      // First paint of a freshly loaded history: land on the unread
      // divider (or the bottom when there's nothing unseen) instead of
      // starting at the top and scrolling down through everything. Keyed
      // on the messages array identity (not its length), so switching
      // between two conversations of equal length still re-anchors.
      pendingInitialScrollRef.current = false;
      const scroller = scrollerRef.current;
      if (scroller) {
        if (unreadAnchorId) {
          scroller
            .querySelector(`[data-message-id="${CSS.escape(unreadAnchorId)}"]`)
            ?.scrollIntoView({ block: "center" });
        } else {
          scroller.scrollTop = scroller.scrollHeight;
        }
      }
      return;
    }
    // New messages while pinned to the bottom: follow them and keep the
    // last-seen cursor current so a later reopen anchors correctly.
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      const newest = messages[messages.length - 1];
      if (newest && !newest.id.startsWith("local-")) {
        setLastSeen("ADMIN", conversationId, newest.id, newest.createdAt);
      }
    }
  }, [messages]);

  function handleThreadScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    nearBottomRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  // Same mobile-keyboard treatment as the visitor chat: the admin shell
  // shrinks to the visual viewport, and the thread stays pinned to the
  // newest message if that's where the admin was already reading.
  useKeyboardViewport(() => {
    const scroller = scrollerRef.current;
    if (nearBottomRef.current && scroller) scroller.scrollTop = scroller.scrollHeight;
  });

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
            // Our own send's echo (the WS push can beat the REST response):
            // swap the optimistic bubble out in place, keyed by clientId,
            // so a sent message never flashes as two bubbles for a frame.
            if (event.message.clientId) {
              const optimistic = prev.find((m) => m.id === event.message.clientId && m.status === "sending");
              if (optimistic) {
                return prev
                  .map((m) => (m.id === event.message.clientId ? dto : m))
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              }
            }
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
          setMessages((prev) => {
            const target = prev.find((m) => m.id === event.messageId);
            if (target) evictAttachmentsOf(target.attachments);
            return prev.map((m) => (m.id === event.messageId ? { ...m, deleted: true, text: "" } : m));
          });
          break;
        case "messages.deleted":
          if (!belongsHere(event.conversationId)) return;
          setMessages((prev) => {
            const removed = new Set(event.messageIds);
            evictAttachmentsOf(prev.filter((m) => removed.has(m.id)).flatMap((m) => m.attachments));
            return prev.filter((m) => !removed.has(m.id));
          });
          break;
        case "reaction.updated":
          if (!belongsHere(event.conversationId)) return;
          setMessages((prev) => prev.map((m) => (m.id === event.messageId ? { ...m, reactions: event.reactions } : m)));
          break;
        case "note.updated":
          if (event.conversationId === conversationId) setIncomingNote(event.note);
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
                  visitorInsightsActive: prev.visitorInsightsActive,
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

  // Hiding is filtered in at render time, never by dropping rows from
  // `messages` itself - that array is the source of truth reply previews
  // look up against, and fetchConversation() rebuilds it wholesale on every
  // load/reconnect, so a locally-hidden message would just reappear next
  // reload if it were removed from there instead.
  const visibleMessages = useMemo(() => messages.filter((m) => !hiddenIds.has(m.id)), [messages, hiddenIds]);
  const threadItems = useMemo(
    () => withDateSeparators(visibleMessages, new Date(), unreadAnchorId),
    [visibleMessages, unreadAnchorId],
  );

  // Compact single-line "Replying to: …" banner text for the composer -
  // truncated for long quotes, "Photo · cat.jpg"-style for attachments.
  const replyPreviewText = useMemo(
    () => (replyTo && conversationKey ? buildReplyPreviewInfo(replyTo, conversationKey).text : undefined),
    [replyTo, conversationKey],
  );

  // Only the single most-recently-read own (ADMIN) message should show
  // "Read" - computed once per messages change, not per-bubble.
  const lastReadOwnMessageId = useMemo(() => {
    let id: string | null = null;
    for (const m of messages) {
      if (m.senderType === "ADMIN" && !m.deleted && m.status === "sent" && m.readAt) id = m.id;
    }
    return id;
  }, [messages]);

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
            // Magic-byte sniffed: a .zip renamed to .mp4/.jpg is stored as
            // its real type and renders as a plain download, never media.
            mimetype: resolveFileMimetypeWithBytes(file.type, file.name, bytes),
            size: file.size,
          });
          return { meta, blob: new Blob([toBlobPart(encryptedBlob)]) };
        }),
      );
      const payload = encryptMessageText(conversationKey!, text);
      const dto = await sendAdminMessage(conversationId, {
        content: payload,
        replyToId,
        clientId: localId,
        attachments,
        onUploadProgress: (progress) => {
          setMessages((prev) =>
            prev.map((message) => (message.id === localId ? { ...message, transferProgress: progress } : message)),
          );
        },
      });
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== localId);
        // The WebSocket push for this same message can arrive before this
        // REST response does - if it already landed, just drop the
        // optimistic placeholder instead of adding a second copy.
        if (withoutOptimistic.some((m) => m.id === dto.id)) return withoutOptimistic;
        return [...withoutOptimistic, decryptDto(dto)].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      const pending = pendingRef.current.get(localId);
      if (pending) revokePendingAttachmentPreviews(pending.previews);
      pendingRef.current.delete(localId);
      draft.clearIfMatches(text);
      onChanged();
    } catch (err) {
      const reason = err instanceof Error ? err.message : "The message could not be sent.";
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, status: "failed", failureReason: reason } : m)),
      );
      showToast({
        title: files.length > 0 ? "Attachment upload failed" : "Message failed",
        message: reason,
      });
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
        .catch((err) => {
          const reason = err instanceof ApiError ? err.message : "The edit could not be saved.";
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status: "failed", failureReason: reason } : m)),
          );
          showToast({ title: "Edit failed", message: reason });
        });
      return;
    }

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const replyToId = replyTo?.id ?? null;
    const pendingAttachments = createPendingAttachmentPreviews(files);
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
      pendingAttachments,
      transferProgress: files.length > 0 ? 0 : undefined,
    };
    setMessages((prev) => [...prev, optimistic]);
    pendingRef.current.set(localId, { text, files, replyToId, previews: pendingAttachments });
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

  function handleDeleteForMe(message: DisplayMessage) {
    hideMessageLocally(conversationId, message.id);
    setHiddenIds((prev) => new Set(prev).add(message.id));
    setDeleteTarget(null);
  }

  async function handleDeleteForEveryone(message: DisplayMessage) {
    setDeleteTarget(null);
    try {
      await deleteAdminMessage(conversationId, message.id);
      evictAttachmentsOf(message.attachments);
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, deleted: true, text: "" } : m)));
    } catch (error) {
      showToast({
        title: "Message could not be deleted",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  async function handleReact(message: DisplayMessage, emoji: string | null) {
    try {
      if (emoji === null) await clearAdminReaction(conversationId, message.id);
      else await setAdminReaction(conversationId, message.id, encryptReaction(conversationKey!, emoji));
    } catch (error) {
      showToast({
        title: "Reaction could not be updated",
        message: error instanceof Error ? error.message : "Please try again.",
      });
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

  /** True cancel: discards the draft and closes the editor without saving
   *  anything, same as the input's own Escape handler. This button used to
   *  be labeled "Clear" and actually wiped+saved an empty alias - a
   *  destructive action mislabeled as a no-op cancel. Removing an existing
   *  nickname is still possible the ordinary way: empty the field and hit
   *  Save. */
  function cancelAliasEdit() {
    setAliasDraft(conversation?.adminAlias ?? "");
    setEditingAlias(false);
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
                  onMouseDown={(e) => {
                    // mousedown fires before the input's onBlur save, so
                    // preventDefault here stops that blur (and the save it
                    // would otherwise trigger) from racing this cancel.
                    e.preventDefault();
                    cancelAliasEdit();
                  }}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-muted)]"
                >
                  Cancel
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
                  {conversation.adminAlias ||
                    conversation.anonymousDisplayName ||
                    `Anonymous #${conversation.publicId}`}
                </h2>
                <Pencil
                  size={12}
                  aria-hidden
                  className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text)]"
                />
              </button>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 truncate px-1 text-[11px] text-[var(--text-muted)]">
              {conversation.adminAlias && conversation.anonymousDisplayName ? (
                `Visitor name: ${conversation.anonymousDisplayName}`
              ) : userOnline ? (
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
        <div className="flex shrink-0 items-center gap-1">
          <RetentionPopover
            retention={conversation.retention}
            who="ADMIN"
            onChange={async (patch) => {
              const updated = await updateAdminRetention(conversationId, patch);
              setConversation((prev) => (prev ? { ...prev, retention: updated.retention } : prev));
            }}
          />
          {/* Only visitors who explicitly opted into diagnostics have a row
              to look at - don't show an info icon that opens an empty
              drawer for everyone else. */}
          {conversation.visitorInsightsActive && (
            <button
              type="button"
              onClick={() => setInsightsOpen(true)}
              title="View visitor insights"
              aria-label="View visitor insights"
              className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
            >
              <Info size={18} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            title="Open private note"
            aria-label="Open private note"
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <StickyNote size={18} aria-hidden />
          </button>
        </div>
      </header>

      <ConnectionBanner status={wsStatus} />

      <div ref={scrollerRef} onScroll={handleThreadScroll} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            No messages yet.
          </div>
        ) : (
          <div className="space-y-3">
            {threadItems.map((item) =>
              item.kind === "separator" ? (
                <DateSeparator key={item.key} label={item.label} />
              ) : item.kind === "unread" ? (
                <UnreadDivider key={item.key} />
              ) : (
                <div key={item.key} data-message-id={item.message.id}>
                <MessageBubble
                  message={item.message}
                  isOwn={item.message.senderType === "ADMIN"}
                  conversationKey={conversationKey}
                  attachmentUrlFor={(id) => adminAttachmentUrl(conversationId, id)}
                  canEdit={
                    site
                      ? Date.now() - new Date(item.message.createdAt).getTime() <=
                        site.limits.messageEditWindowMinutes * 60_000
                      : false
                  }
                  showReadReceipt={item.message.id === lastReadOwnMessageId}
                  replyPreviewMessage={
                    item.message.replyToId ? messages.find((m) => m.id === item.message.replyToId) : undefined
                  }
                  onReply={() => setReplyTo(item.message)}
                  onEdit={() => setEditing(item.message)}
                  onDelete={() => setDeleteTarget(item.message)}
                  onReact={(emoji) => handleReact(item.message, emoji)}
                  onRetry={() => handleRetry(item.message)}
                  onFirstInteraction={dismissHint}
                />
                </div>
              ),
            )}
          </div>
        )}
        {userTyping && <TypingIndicator label="Typing…" />}
        {touchUi && showTapHint && messages.length > 0 && <TapMessageHint />}
        <div ref={bottomRef} />
      </div>

      <Composer
        maxLength={site?.limits.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH}
        maxAttachments={site?.limits.maxAttachmentsPerMessage ?? 5}
        attachmentLimits={
          site?.limits.attachmentSize ?? {
            globalMb: 100,
            imageMb: 20,
            videoMb: 100,
            audioMb: 30,
            documentMb: 50,
            otherMb: 25,
          }
        }
        disabled={false}
        replyPreview={replyPreviewText}
        onCancelReply={() => setReplyTo(null)}
        editingPreview={editing ? "editing message" : undefined}
        initialText={editing?.text}
        onCancelEdit={() => setEditing(null)}
        onSend={handleSend}
        onTypingChange={(isTyping) => wsSend({ type: isTyping ? "typing.start" : "typing.stop", conversationId })}
        cannedReplies={cannedReplies}
        draftId={`admin:${conversationId}`}
        draftText={draft.draftText}
        onDraftChange={draft.updateDraft}
        gifProviders={site?.gifProviders}
      />

      {deleteTarget && (
        <DeleteMessageModal
          isOwn={deleteTarget.senderType === "ADMIN"}
          onDeleteForMe={() => handleDeleteForMe(deleteTarget)}
          onDeleteForEveryone={() => void handleDeleteForEveryone(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {insightsOpen && <VisitorInsightsDrawer conversationId={conversationId} onClose={() => setInsightsOpen(false)} />}
      {noteOpen && conversationKey && (
        <Suspense fallback={null}>
          <SharedNoteDrawer
            role="ADMIN"
            conversationId={conversationId}
            conversationKey={conversationKey}
            maxAssetSizeMb={site?.limits.attachmentSize.globalMb ?? 100}
            incomingNote={incomingNote}
            onClose={() => setNoteOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
