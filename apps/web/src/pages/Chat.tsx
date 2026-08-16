import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encryptBlob } from "@anonchat/crypto";
import { ChevronRight, LogOut, StickyNote, Trash2 } from "lucide-react";
import type { ConversationNoteDto, MessageDto, ServerWsEvent } from "@anonchat/shared";
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
import { useEncryptedDraft } from "../hooks/useEncryptedDraft.js";
import { Composer } from "../components/chat/Composer.js";
import { ConnectionBanner } from "../components/chat/ConnectionBanner.js";
import { DateSeparator } from "../components/chat/DateSeparator.js";
import { withDateSeparators } from "../components/chat/dateSeparators.js";
import { DeleteMessageModal } from "../components/chat/DeleteMessageModal.js";
import { DeleteIdentityModal } from "../components/chat/DeleteIdentityModal.js";
import { getLocallyDeletedMessageIds, hideMessageLocally } from "../components/chat/locallyDeletedMessages.js";
import { MessageBubble } from "../components/chat/MessageBubble.js";
import { NotificationEmailPrompt } from "../components/chat/NotificationEmailPrompt.js";
import { NotificationPreferencesButton } from "../components/chat/NotificationPreferencesButton.js";
import { VisitorInsightsControl } from "../components/chat/VisitorInsightsControl.js";
import { ExpandableProse } from "../components/chat/ExpandableProse.js";
import { renderMessageMarkdown } from "../components/chat/markdown.js";
import {
  dismissNotificationEmailPrompt,
  isNotificationEmailPromptDismissed,
} from "../components/chat/notificationEmailPromptDismissed.js";
import { TypingIndicator } from "../components/chat/TypingIndicator.js";
import { DefaultAvatar } from "../components/common/DefaultAvatar.js";
import { FullScreenLoader } from "../components/common/Loader.js";
import { AdminProfilePanel } from "../components/chat/AdminProfilePanel.js";
import {
  decryptMessageTextWithStatus,
  encryptAttachmentMeta,
  encryptMessageText,
  encryptReaction,
  getConversationKey,
  toBlobPart,
} from "../crypto/conversationCrypto.js";
import type { DisplayMessage } from "../components/chat/types.js";
import { resolveFileMimetype } from "../components/chat/preview/textFileTypes.js";
import { useToast } from "../context/ToastContext.js";
import {
  createPendingAttachmentPreviews,
  revokePendingAttachmentPreviews,
} from "../components/chat/PendingAttachmentTransfer.js";

const SharedNoteDrawer = lazy(() => import("../components/note/SharedNoteDrawer.js"));

export default function Chat() {
  const { showToast } = useToast();
  // Chat only ever mounts once PublicApp has confirmed both are resolved
  // (status === "ready" and site is loaded) - asserted here rather than
  // early-returned so every hook below stays unconditional.
  const { session: activeSession, setConversationStatus, logout, deleteIdentity } = useAnonymousSession();
  const { site: activeSite } = useSite();
  const { syncFromServer } = useTheme();
  const session = activeSession!;
  const site = activeSite!;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const [editing, setEditing] = useState<DisplayMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DisplayMessage | null>(null);
  const [deleteIdentityOpen, setDeleteIdentityOpen] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getLocallyDeletedMessageIds(session.conversationId));
  const [adminOnline, setAdminOnline] = useState<boolean | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [incomingNote, setIncomingNote] = useState<ConversationNoteDto | null>(null);
  // The profile panel opens by default on desktop where it sits beside the
  // chat, but on small screens it replaces the chat entirely - so mobile
  // visitors land in the conversation and can open the profile on demand.
  const [profileOpen, setProfileOpen] = useState(
    () =>
      window.matchMedia("(min-width: 640px)").matches &&
      sessionStorage.getItem("anonchat.adminProfileHidden") !== "true",
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  // The messages pane is its own scroll container; nearBottomRef tracks
  // whether the visitor is reading the latest messages so the view can be
  // pinned to the bottom when the keyboard opens and the pane shrinks.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFilesRef = useRef<
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
      for (const pending of pendingFilesRef.current.values()) {
        revokePendingAttachmentPreviews(pending.previews);
      }
    },
    [],
  );

  const conversationKey = useMemo(
    () => getConversationKey(session.identity, session.adminPublicKeys.exchangePublicKey, session.conversationId),
    [session],
  );
  const welcomeHtml = useMemo(() => renderMessageMarkdown(site.welcomeMessage), [site.welcomeMessage]);
  const draft = useEncryptedDraft("USER", session.conversationId, conversationKey);

  const decryptDto = useCallback(
    (dto: MessageDto): DisplayMessage => {
      const decrypted = dto.content ? decryptMessageTextWithStatus(conversationKey, dto.content) : null;
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
    void loadAllMessages()
      .then((all) => {
        if (cancelled) return;
        setMessages(all.map(decryptDto));
        const lastAdmin = [...all].reverse().find((m) => m.senderType === "ADMIN");
        if (lastAdmin && !lastAdmin.readAt) markRead(lastAdmin.id).catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAllMessages, decryptDto]);

  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mobile keyboards: keep the shell's height in sync with the visual
  // viewport (the area the keyboard leaves visible). On iOS Safari the
  // layout viewport never resizes for the keyboard, so this is the only
  // way the composer ends up above the keyboard instead of under it. When
  // the viewport shrinks, pin the thread to the latest message if the
  // visitor was already reading from the bottom - preserving scrollTop
  // alone would leave the newest messages below the fold, which is what
  // made the conversation appear to "jump up" while typing.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      document.documentElement.style.setProperty("--vvh", `${viewport.height}px`);
      const scroller = scrollerRef.current;
      if (nearBottomRef.current && scroller) scroller.scrollTop = scroller.scrollHeight;
    };
    viewport.addEventListener("resize", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--vvh");
    };
  }, []);

  function handleThreadScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    nearBottomRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

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
        case "note.updated": {
          if (event.conversationId === session.conversationId) setIncomingNote(event.note);
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
    void loadAllMessages()
      .then((all) => setMessages(all.map(decryptDto)))
      .catch(() => {});
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
            mimetype: resolveFileMimetype(file.type, file.name),
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
      const dto = await sendMessage({
        content: payload,
        replyToId,
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
      if (
        isFirstUserMessage &&
        site.emailNotificationsAvailable &&
        !isNotificationEmailPromptDismissed(session.conversationId)
      ) {
        setShowNotificationPrompt(true);
      }
      const pending = pendingFilesRef.current.get(localId);
      if (pending) revokePendingAttachmentPreviews(pending.previews);
      pendingFilesRef.current.delete(localId);
      draft.clearIfMatches(text);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "The message could not be sent.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === localId
            ? {
                ...m,
                status: "failed",
                failureReason: reason,
              }
            : m,
        ),
      );
      showToast({
        title: files.length > 0 ? "Attachment upload failed" : "Message failed",
        message: reason,
      });
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
      pendingAttachments,
      transferProgress: files.length > 0 ? 0 : undefined,
    };
    // Sending always returns the view to the newest message, even if the
    // visitor had scrolled up while composing.
    nearBottomRef.current = true;
    setMessages((prev) => [...prev, optimistic]);
    pendingFilesRef.current.set(localId, { text, files, replyToId, previews: pendingAttachments });
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
    } catch (error) {
      showToast({
        title: "Message could not be deleted",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  async function handleReact(message: DisplayMessage, emoji: string | null) {
    try {
      if (emoji === null) await clearReaction(message.id);
      else await setReaction(message.id, encryptReaction(conversationKey, emoji));
    } catch (error) {
      showToast({
        title: "Reaction could not be updated",
        message: error instanceof Error ? error.message : "Please try again.",
      });
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
  function showProfile() {
    sessionStorage.removeItem("anonchat.adminProfileHidden");
    setProfileOpen(true);
  }

  function hideProfile() {
    sessionStorage.setItem("anonchat.adminProfileHidden", "true");
    setProfileOpen(false);
  }

  function toggleProfile() {
    if (profileOpen) hideProfile();
    else showProfile();
  }

  const canEdit = (message: DisplayMessage) => {
    if (!site.limits.messageEditWindowMinutes) return false;
    const ageMs = Date.now() - new Date(message.createdAt).getTime();
    return ageMs <= site.limits.messageEditWindowMinutes * 60_000;
  };

  return (
    <main className="vvh-shell flex overflow-hidden">
      {profileOpen && <AdminProfilePanel site={site} onClose={hideProfile} />}
      <div className={profileOpen ? "hidden min-w-0 flex-1 flex-col sm:flex" : "flex min-w-0 flex-1 flex-col"}>
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 sm:px-4 sm:py-2.5">
          <button
            type="button"
            onClick={toggleProfile}
            aria-label={profileOpen ? "Hide admin profile" : "Show admin profile"}
            aria-expanded={profileOpen}
            className="flex min-w-0 items-center gap-2.5 rounded-lg text-left hover:bg-[var(--surface-muted)]"
          >
            {!profileOpen && <ChevronRight size={16} className="ml-1 shrink-0 text-[var(--text-muted)]" aria-hidden />}
            {site.avatarUrl ? (
              <img src={site.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <DefaultAvatar name={site.displayName} className="h-8 w-8 shrink-0 text-sm" />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight">{site.displayName}</h1>
              {site.presenceEnabled && adminOnline !== null && (
                <p className="text-xs leading-tight text-[var(--text-muted)]">{adminOnline ? "Online" : "Offline"}</p>
              )}
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <VisitorInsightsControl conversationId={session.conversationId} config={site.visitorInsights} />
            <NotificationPreferencesButton
              vapidPublicKey={site.vapidPublicKey}
              emailAvailable={site.emailNotificationsAvailable}
            />
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              title="Open private note"
              aria-label="Open private note"
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            >
              <StickyNote size={18} aria-hidden />
            </button>
            {/* The account ID is only meaningful when there is room for it -
                on small screens it is noise, and everything here must fit in
                a single header row. */}
            <span className="hidden max-w-48 truncate rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs sm:inline-block">
              {session.displayName ? `${session.displayName} · ` : ""}
              <span className="font-mono">#{session.publicId}</span>
            </span>
            <button
              type="button"
              onClick={() => logout()}
              title="Switch identity"
              aria-label="Switch identity"
              className="flex items-center gap-1.5 rounded-lg p-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
            >
              <LogOut size={16} aria-hidden />
              <span className="hidden underline underline-offset-2 sm:inline">Switch identity</span>
            </button>
            {site.privacyPolicyUrl && (
              <a
                href={site.privacyPolicyUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)] sm:block"
              >
                Privacy
              </a>
            )}
            <button
              type="button"
              onClick={() => setDeleteIdentityOpen(true)}
              title="Delete this identity and its data"
              aria-label="Delete this identity and its data"
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-fg)]"
            >
              <Trash2 size={17} aria-hidden />
            </button>
          </div>
        </header>

        <ConnectionBanner status={wsStatus} />

        <div ref={scrollerRef} onScroll={handleThreadScroll} className="flex-1 overflow-y-auto px-4 py-4">
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
          attachmentLimits={site.limits.attachmentSize}
          disabled={isBlocked}
          disabledReason={isBlocked ? "You can no longer send messages in this conversation." : undefined}
          replyPreview={replyTo?.text}
          onCancelReply={() => setReplyTo(null)}
          editingPreview={editing ? "editing message" : undefined}
          initialText={editing?.text}
          onCancelEdit={() => setEditing(null)}
          onSend={handleSend}
          onTypingChange={handleTypingChange}
          draftId={`user:${session.conversationId}`}
          draftText={draft.draftText}
          onDraftChange={draft.updateDraft}
        />
      </div>

      {deleteTarget && (
        <DeleteMessageModal
          onDeleteForMe={() => handleDeleteForMe(deleteTarget)}
          onDeleteForEveryone={() => void handleDeleteForEveryone(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {deleteIdentityOpen && (
        <DeleteIdentityModal onDelete={deleteIdentity} onCancel={() => setDeleteIdentityOpen(false)} />
      )}
      {noteOpen && (
        <Suspense fallback={null}>
          <SharedNoteDrawer
            role="USER"
            conversationId={session.conversationId}
            conversationKey={conversationKey}
            maxAssetSizeMb={site.limits.attachmentSize.globalMb}
            incomingNote={incomingNote}
            readOnly={isBlocked}
            onClose={() => setNoteOpen(false)}
          />
        </Suspense>
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
