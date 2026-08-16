import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { format } from "date-fns";
import { AlertTriangle, ChevronDown, SmilePlus, Reply, Pencil, Trash2, Paperclip, X } from "lucide-react";
import { decryptAttachmentMeta, decryptReaction } from "../../crypto/conversationCrypto.js";
import { renderMessageMarkdown } from "./markdown.js";
import { AttachmentPreview, previewKind } from "./AttachmentPreview.js";
import { ExpandableProse } from "./ExpandableProse.js";
import { extractUrls } from "./embeds/urlExtraction.js";
import { detectVideoEmbed } from "./embeds/videoEmbedDetection.js";
import { VideoEmbed } from "./embeds/VideoEmbed.js";
import { isGifUrl } from "./embeds/gifEmbedDetection.js";
import { GifEmbed } from "./embeds/GifEmbed.js";
import { LinkPreviewCard } from "./embeds/LinkPreviewCard.js";
import { ReactionOverlay } from "./ReactionOverlay.js";
import { EmojiPicker } from "./emoji/EmojiPicker.js";
import type { DisplayMessage } from "./types.js";
import { PendingAttachmentTransfer } from "./PendingAttachmentTransfer.js";
import { buildReplyPreviewInfo } from "./replyPreview.js";

/** Slack/Discord-style: a message can carry a few link embeds/previews,
 *  not an unbounded wall of them if someone pastes a long list of URLs. */
const MAX_EMBEDS_PER_MESSAGE = 3;

/** The quick-react strip shown in the message options menu. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Movement beyond this switches the touch gesture from a tap to a swipe. */
const SWIPE_START_PX = 12;
/** Swiping right past this distance arms a reply. */
const SWIPE_REPLY_PX = 64;
/** The bubble tracks the finger up to this offset while swiping. */
const SWIPE_MAX_PX = 96;

interface Props {
  message: DisplayMessage;
  isOwn: boolean;
  conversationKey: Uint8Array;
  attachmentUrlFor: (attachmentId: string) => string;
  /** The message this one quotes, when it's a reply - the bubble builds its
   *  own truncated preview from it (see replyPreview.ts). */
  replyPreviewMessage?: DisplayMessage;
  canEdit: boolean;
  disableActions?: boolean;
  /** Only the single most-recent read own-message in the thread should show
   *  "Read" - the parent computes which one that is (see Chat.tsx /
   *  ConversationView.tsx) since it requires looking across all messages,
   *  not just this one. */
  showReadReceipt?: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string | null) => void;
  onRetry?: () => void;
}

export function MessageBubble({
  message,
  isOwn,
  conversationKey,
  attachmentUrlFor,
  replyPreviewMessage,
  canEdit,
  disableActions = false,
  showReadReceipt = false,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onRetry,
}: Props) {
  // The React button's own rect (captured on click), not just a boolean -
  // that's what lets the overlay float directly above whichever button was
  // actually clicked (see ReactionOverlay) instead of a fixed spot.
  const [reactionAnchor, setReactionAnchor] = useState<DOMRect | null>(null);
  const [reactionExpanded, setReactionExpanded] = useState(false);

  // Message options menu (quick reactions + reply/edit/delete), opened by
  // the mobile chevron next to the bubble: dims + blurs the chat behind an
  // enlarged copy of the bubble. Replaces the long-press trigger, which
  // fights the browser's own touch gestures on mobile web.
  const [actionMenu, setActionMenu] = useState(false);
  const [menuFullPicker, setMenuFullPicker] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    horizontal: boolean | null;
    dx: number;
    touch: boolean;
  } | null>(null);

  useEffect(() => {
    if (!actionMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionMenu(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actionMenu]);

  useEffect(() => {
    if (!reactionAnchor) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest("[data-reaction-overlay]") || target?.closest("[data-reaction-trigger]")) return;
      setReactionAnchor(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [reactionAnchor]);

  function toggleReactionPicker(rect: DOMRect) {
    setReactionAnchor((prev) => (prev ? null : rect));
    setReactionExpanded(false);
  }

  function handlePressStart(e: ReactPointerEvent<HTMLDivElement>) {
    if (disableActions || message.deleted || message.decryptionError) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipeState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      horizontal: null,
      dx: 0,
      touch: e.pointerType !== "mouse",
    };
  }

  function handlePressMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = swipeState.current;
    if (!state || e.pointerId !== state.pointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (state.horizontal === null && (absDx > SWIPE_START_PX || absDy > SWIPE_START_PX)) {
      state.horizontal = absDx > absDy;
    }
    if (state.horizontal && state.touch) {
      // Swipe right on any message - the other party's or your own - and
      // the bubble tracks the finger; released past the threshold, it
      // enters reply mode for that message.
      state.dx = Math.max(0, Math.min(dx, SWIPE_MAX_PX));
      setSwipeOffset(state.dx);
    }
  }

  function handlePressEnd() {
    const state = swipeState.current;
    swipeState.current = null;
    if (state?.horizontal && state.touch && state.dx >= SWIPE_REPLY_PX) {
      onReply();
    }
    setSwipeOffset(0);
  }

  const decryptedReactions = useMemo(
    () =>
      message.reactions
        .map((r) => ({ senderType: r.senderType, emoji: decryptReaction(conversationKey, r.emoji) }))
        .filter((r): r is { senderType: "USER" | "ADMIN"; emoji: string } => r.emoji !== null),
    [message.reactions, conversationKey],
  );

  const myReaction = decryptedReactions.find(
    (r) => r.senderType === (isOwn ? message.senderType : message.senderType === "USER" ? "ADMIN" : "USER"),
  );

  function pickReaction(emoji: string) {
    onReact(myReaction?.emoji === emoji ? null : emoji);
    setReactionAnchor(null);
  }

  function closeMenu() {
    setActionMenu(false);
    setMenuFullPicker(false);
  }

  const html = message.deleted || message.decryptionError ? null : renderMessageMarkdown(message.text);

  // A message that is ONLY photos renders each image as its own rounded
  // frame instead of one shared bubble rectangle: the shared wrapper used
  // to take the widest image's width and draw that rectangle around every
  // photo, so a portrait image next to a panorama looked like it was
  // stretched into the panorama's box.
  const attachmentKinds = useMemo(
    () =>
      message.attachments.map((a) => {
        const meta = decryptAttachmentMeta(conversationKey, a.meta);
        return meta ? previewKind(meta.mimetype, meta.filename) : "binary";
      }),
    [message.attachments, conversationKey],
  );
  const imageOnly =
    !message.deleted &&
    !message.decryptionError &&
    message.attachments.length > 0 &&
    message.attachments.every((_, i) => attachmentKinds[i] === "image") &&
    message.text.trim() === "" &&
    (message.pendingAttachments?.length ?? 0) === 0;

  const embedUrls = useMemo(
    () => (message.deleted || message.decryptionError ? [] : extractUrls(message.text, MAX_EMBEDS_PER_MESSAGE)),
    [message.deleted, message.decryptionError, message.text],
  );

  const replyInfo = useMemo(
    () => buildReplyPreviewInfo(replyPreviewMessage, conversationKey),
    [replyPreviewMessage, conversationKey],
  );
  const showReplyPreview = replyInfo.kind !== "empty" && !message.deleted;

  // Shared pointer wiring for swipe-to-reply. touch-action pan-y keeps
  // vertical scrolling native while horizontal drags reach these handlers.
  const pressHandlers = {
    onPointerDown: handlePressStart,
    onPointerMove: handlePressMove,
    onPointerUp: handlePressEnd,
    onPointerCancel: handlePressEnd,
  };

  const messageActionsProps = {
    canEdit,
    isOwn,
    disableActions,
    reactionActive: reactionAnchor !== null,
    onToggleReaction: toggleReactionPicker,
    onReply,
    onEdit,
    onDelete,
  };

  /** Mobile-only options trigger: sits OUTSIDE the bubble - to its right
   *  when the other party sent it, to its left when it's your own - and
   *  opens the action menu. Desktop keeps the hover-revealed buttons. */
  const chevronButton = (side: "left" | "right") => (
    <button
      type="button"
      aria-label="Message options"
      onClick={() => setActionMenu(true)}
      className="mb-1 shrink-0 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] md:hidden"
      data-side={side}
    >
      <ChevronDown size={16} aria-hidden />
    </button>
  );

  return (
    <div
      className={clsx("group flex flex-col gap-1 [touch-action:pan-y]", isOwn ? "items-end" : "items-start")}
      // A transform is applied ONLY while the finger is actually swiping.
      // An always-present (even identity) transform makes this div the
      // containing block for position:fixed descendants, which confined
      // the full-screen attachment viewers to the message's own box
      // instead of covering the screen.
      style={
        swipeOffset > 0
          ? { transform: `translateX(${swipeOffset}px)`, transition: "none", opacity: 1 - swipeOffset / 220 }
          : undefined
      }
      {...pressHandlers}
    >
      {showReplyPreview && (
        <div
          className={clsx(
            // min-w-0 + truncate keep even a very long quoted message or
            // filename to a single compact line above the bubble.
            "flex max-w-[80%] min-w-0 items-center gap-1.5 rounded-md border-l-2 px-2 py-1 text-xs text-[var(--text-muted)]",
            "border-[var(--color-accent-400)]",
            replyInfo.kind === "deleted" && "italic",
          )}
        >
          {replyInfo.kind === "attachment" && <Paperclip size={11} className="shrink-0" aria-hidden />}
          <span className="min-w-0 truncate">{replyInfo.text}</span>
        </div>
      )}

      {imageOnly ? (
        <div className="min-w-0 max-w-[80%]">
          <div className="flex min-w-0 max-w-full items-end gap-1">
            {isOwn && <MessageActions {...messageActionsProps} />}
            {isOwn && chevronButton("left")}
            <div className="min-w-0 max-w-full space-y-2">
              {message.attachments.map((a) => (
                <AttachmentPreview
                  key={a.id}
                  attachment={a}
                  conversationKey={conversationKey}
                  downloadUrl={attachmentUrlFor(a.id)}
                  standalone
                />
              ))}
            </div>
            {!isOwn && chevronButton("right")}
            {!isOwn && <MessageActions {...messageActionsProps} />}
          </div>
          {/* Timestamp under the photos (below the frames, like the Read
              receipt on text messages) instead of inside a shared bubble. */}
          <div
            className={clsx(
              "mt-1 flex items-center gap-1 px-1 text-[10px] leading-none text-[var(--text-muted)] opacity-70",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            <span>{format(new Date(message.createdAt), "p")}</span>
            {message.edited && <span>· edited</span>}
            {isOwn && showReadReceipt && <span>· Read</span>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 max-w-[80%] items-end gap-1">
            {isOwn && <MessageActions {...messageActionsProps} />}
            {isOwn && chevronButton("left")}

            <div
              className={clsx(
                // min-w-0: this is a flex item (the row above is `flex`), and a
                // flex item's default min-width is `auto` - i.e. it refuses to
                // shrink below its content's intrinsic width. Without this, a
                // long unbroken string overrides max-w-[80%] entirely instead
                // of wrapping, since the bubble never gets small enough for
                // .prose-message's own overflow-wrap to kick in.
                "min-w-0 max-w-full overflow-hidden rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                isOwn
                  ? "bg-[var(--bubble-user)] text-[var(--bubble-user-text)] text-right"
                  : "bg-[var(--bubble-admin)] text-[var(--bubble-admin-text)]",
              )}
            >
              {message.deleted ? (
                <p className="italic opacity-70">Message deleted</p>
              ) : message.decryptionError ? (
                <div className="max-w-md" role="alert">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle size={15} aria-hidden />
                    This message could not be decrypted
                  </p>
                  <p className="mt-1 text-xs leading-relaxed opacity-80">{message.decryptionError}</p>
                </div>
              ) : (
                <>
                  {message.pendingAttachments && message.pendingAttachments.length > 0 && (
                    <PendingAttachmentTransfer
                      attachments={message.pendingAttachments}
                      progress={message.transferProgress}
                    />
                  )}
                  {message.attachments.length > 0 && (
                    <div className="mb-2 min-w-0 max-w-full space-y-2 overflow-hidden">
                      {message.attachments.map((a) => (
                        <AttachmentPreview
                          key={a.id}
                          attachment={a}
                          conversationKey={conversationKey}
                          downloadUrl={attachmentUrlFor(a.id)}
                        />
                      ))}
                    </div>
                  )}
                  {html && <ExpandableProse html={html} />}
                  {embedUrls.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {embedUrls.map((url) => {
                        if (isGifUrl(url)) return <GifEmbed key={url} url={url} />;
                        const video = detectVideoEmbed(url);
                        return video ? <VideoEmbed key={url} embed={video} /> : <LinkPreviewCard key={url} url={url} />;
                      })}
                    </div>
                  )}
                  {/* Timestamp stays inside the bubble: right-aligned on the
                      sender's own messages, left-aligned on the other
                      party's - i.e. anchored to the side the message came
                      from, so no row separates the bubbles vertically. The
                      Read receipt alone lives outside, at the very bottom
                      of the sent messages. */}
                  <div
                    className={clsx(
                      "mt-1 flex items-center gap-1 text-[10px] leading-none opacity-70",
                      isOwn ? "justify-end" : "justify-start",
                    )}
                  >
                    <span>{format(new Date(message.createdAt), "p")}</span>
                    {message.edited && <span>· edited</span>}
                    {isOwn && message.status === "sending" && <span>· Sending…</span>}
                  </div>
                </>
              )}
            </div>

            {!isOwn && chevronButton("right")}
            {!isOwn && <MessageActions {...messageActionsProps} />}
          </div>

          {/* Read receipt: the one piece that lives OUTSIDE the bubble, and
              only on the very last read own-message (showReadReceipt is
              computed by the parent across the whole thread). */}
          {isOwn && showReadReceipt && (
            <div className="flex items-center justify-end gap-1 pr-1 text-[10px] leading-none text-[var(--text-muted)] opacity-70">
              <span>Read</span>
            </div>
          )}
        </>
      )}

      {decryptedReactions.length > 0 && (
        <div className="flex gap-1">
          {decryptedReactions.map((r, i) => (
            <span key={i} className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs" title={r.senderType}>
              {r.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Kept outside the bubble (unlike the time/edited/read row above): a
          send failure needs the page-contrast-checked danger color, which
          isn't guaranteed against every theme's bubble background. Only
          takes up space while actually failed, so it never leaves a gap. */}
      {isOwn && message.status === "failed" && (
        <button
          type="button"
          onClick={onRetry}
          className="max-w-md px-1 text-left text-[11px] text-[var(--danger-fg)] hover:opacity-80"
        >
          <span className="font-semibold underline">Retry</span>
          <span> · {message.failureReason ?? "The message could not be sent."}</span>
        </button>
      )}

      {reactionAnchor && (
        <ReactionOverlay
          anchorRect={reactionAnchor}
          expanded={reactionExpanded}
          onExpand={() => setReactionExpanded(true)}
          onPick={pickReaction}
          onClose={() => setReactionAnchor(null)}
        />
      )}

      {/* Message options menu (opened by the mobile chevron): the chat dims
          and blurs behind an enlarged copy of the bubble, with the
          quick-react strip and Reply / Edit / Delete / Cancel underneath. */}
      {actionMenu && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/50 p-4 backdrop-blur-md"
          onPointerDown={closeMenu}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label="Message actions"
            onPointerDown={(e) => e.stopPropagation()}
            className={clsx(
              "max-h-[42vh] w-full max-w-md overflow-y-auto rounded-2xl px-3.5 py-2 text-sm shadow-xl",
              isOwn
                ? "bg-[var(--bubble-user)] text-[var(--bubble-user-text)]"
                : "bg-[var(--bubble-admin)] text-[var(--bubble-admin-text)]",
            )}
            style={{ transform: "scale(1.08)" }}
          >
            {message.deleted ? (
              <p className="italic opacity-70">Message deleted</p>
            ) : (
              <>
                {message.attachments.length > 0 && (
                  <div className="mb-2 min-w-0 max-w-full space-y-2 overflow-hidden">
                    {message.attachments.map((a) => (
                      <AttachmentPreview
                        key={`menu-${a.id}`}
                        attachment={a}
                        conversationKey={conversationKey}
                        downloadUrl={attachmentUrlFor(a.id)}
                        standalone={imageOnly}
                      />
                    ))}
                  </div>
                )}
                {html && <ExpandableProse html={html} />}
              </>
            )}
          </div>

          <div onPointerDown={(e) => e.stopPropagation()} className="flex max-w-full flex-col items-center gap-3">
            {menuFullPicker ? (
              <div className="max-h-[52vh] w-[min(320px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-xl">
                <EmojiPicker
                  embedded
                  onClose={() => setMenuFullPicker(false)}
                  onSelect={(emoji) => {
                    pickReaction(emoji);
                    closeMenu();
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`React ${emoji}`}
                    onClick={() => {
                      pickReaction(emoji);
                      closeMenu();
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-raised)] text-2xl leading-none shadow-lg hover:scale-105"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="More reactions"
                  onClick={() => setMenuFullPicker(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-raised)] shadow-lg hover:scale-105"
                >
                  <SmilePlus size={20} aria-hidden />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              <MenuAction
                icon={<Reply size={15} aria-hidden />}
                label="Reply"
                onClick={() => {
                  closeMenu();
                  onReply();
                }}
              />
              {isOwn && canEdit && (
                <MenuAction
                  icon={<Pencil size={15} aria-hidden />}
                  label="Edit"
                  onClick={() => {
                    closeMenu();
                    onEdit();
                  }}
                />
              )}
              <MenuAction
                icon={<Trash2 size={15} aria-hidden />}
                label="Delete"
                onClick={() => {
                  closeMenu();
                  onDelete();
                }}
              />
              <MenuAction icon={<X size={15} aria-hidden />} label="Cancel" onClick={closeMenu} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] px-3.5 py-2 text-xs font-semibold shadow-lg hover:bg-[var(--surface-muted)]"
    >
      {icon}
      {label}
    </button>
  );
}

function MessageActions({
  canEdit,
  isOwn,
  disableActions,
  reactionActive,
  onToggleReaction,
  onReply,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  isOwn: boolean;
  disableActions: boolean;
  reactionActive: boolean;
  onToggleReaction: (rect: DOMRect) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    // Desktop-only: hidden below md entirely - on touch screens the chevron
    // next to the bubble opens the options menu instead, so a hover-only
    // reveal no longer decides what a phone can reach. At md+ they hide
    // until hover OR keyboard focus lands on one of the buttons
    // (group-focus-within), which also fixes the earlier keyboard trap
    // where a focused-but-invisible button had no visible focus indicator.
    <div className="hidden gap-0.5 transition-opacity md:flex md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
      <button
        type="button"
        data-reaction-trigger
        title="React"
        aria-label="React"
        aria-expanded={reactionActive}
        disabled={disableActions}
        onClick={(e) => onToggleReaction(e.currentTarget.getBoundingClientRect())}
        className="rounded p-1.5 text-xs hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <SmilePlus size={14} aria-hidden />
      </button>
      <button
        type="button"
        title="Reply"
        aria-label="Reply"
        onClick={onReply}
        className="rounded p-1.5 text-xs hover:bg-[var(--surface-muted)]"
      >
        <Reply size={14} aria-hidden />
      </button>
      {isOwn && canEdit && (
        <button
          type="button"
          title="Edit"
          aria-label="Edit"
          disabled={disableActions}
          onClick={onEdit}
          className="rounded p-1.5 text-xs hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Pencil size={14} aria-hidden />
        </button>
      )}
      {/* Delete is offered on the other party's messages too - the modal
          only exposes "Delete for me" there, since deleting for everyone
          is reserved for the sender. */}
      <button
        type="button"
        title="Delete"
        aria-label="Delete"
        disabled={disableActions}
        onClick={onDelete}
        className="rounded p-1.5 text-xs hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </div>
  );
}
