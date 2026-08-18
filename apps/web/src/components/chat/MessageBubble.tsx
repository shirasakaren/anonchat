import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { format } from "date-fns";
import {
  AlertTriangle,
  Copy,
  Download,
  EllipsisVertical,
  Paperclip,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
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
import { useToast } from "../../context/ToastContext.js";
import { useTouchUi } from "./TapMessageHint.js";
import type { ViewerActions } from "./preview/LightboxActionsMenu.js";
import { QUICK_REACTIONS } from "./quickReactions.js";

/** Slack/Discord-style: a message can carry a few link embeds/previews,
 *  not an unbounded wall of them if someone pastes a long list of URLs. */
const MAX_EMBEDS_PER_MESSAGE = 3;

/** Hold this long (without moving) to select a message - a fallback for
 *  photos, where a tap opens the full-screen viewer. Never the only way:
 *  tapping text bubbles selects them directly. */
const LONG_PRESS_MS = 500;
/** Movement beyond this switches the touch gesture from a tap to a swipe. */
const SWIPE_START_PX = 12;
/** Swiping right past this distance arms a reply. */
const SWIPE_REPLY_PX = 64;
/** The bubble tracks the finger up to this offset while swiping. */
const SWIPE_MAX_PX = 96;
/** How long after a dismissal the trailing click of the same tap stays
 *  swallowed - long enough for mousedown→mouseup→click (a few ms in the
 *  same pointer action), short enough that a deliberate second tap always
 *  selects normally. */
const TAP_DISMISS_BRIDGE_MS = 150;

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
  /** Called the first time the person interacts with any message - the
   *  parent uses it to dismiss the one-time "Tap a message for more
   *  options" hint. */
  onFirstInteraction?: () => void;
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
  onFirstInteraction,
}: Props) {
  const { showToast } = useToast();
  // The React button's own rect (captured on click), not just a boolean -
  // that's what lets the overlay float directly above whichever button was
  // actually clicked (see ReactionOverlay) instead of a fixed spot.
  const [reactionAnchor, setReactionAnchor] = useState<DOMRect | null>(null);
  const [reactionExpanded, setReactionExpanded] = useState(false);

  // Tap-to-select: a normal tap on a bubble highlights it, floats the
  // quick-react strip above it, and opens the action sheet. Tapping
  // anywhere else dismisses it. TOUCH/SMALL SCREENS ONLY - on desktop the
  // bubble stays inert selectable text and the hover ⋯ opens an anchored
  // dropdown instead.
  const touchUi = useTouchUi();
  const [selected, setSelected] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  // Attachment id → monotonically increasing request counter. The sheet's
  // Download row bumps it; AttachmentPreview watches its own counter and
  // decrypts + downloads while showing its progress card.
  const [downloadRequests, setDownloadRequests] = useState<Record<string, number>>({});
  const [swipeOffset, setSwipeOffset] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const swipeState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    horizontal: boolean | null;
    dx: number;
    touch: boolean;
  } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  // The quick-react bar floats below the bubble - unless the bubble is the
  // very last thing in the thread, where a below-bar would fall past the
  // scroller's content edge and be clipped away entirely; then it flips
  // above the bubble instead.
  const [barAbove, setBarAbove] = useState(false);

  useEffect(() => {
    if (!selected) return;
    function handleDown(e: MouseEvent) {
      const target = e.target as Element | null;
      // The sheet is portaled to document.body: clicks on it carry the
      // marker below and must not dismiss the selection.
      if (target?.closest("[data-message-sheet]")) return;
      if (groupRef.current && !groupRef.current.contains(target)) {
        // The trailing click of this very same tap must be swallowed too
        // (see the capture listener below) - record the bridge window.
        suppressUntilRef.current = performance.now() + TAP_DISMISS_BRIDGE_MS;
        setSelected(false);
      }
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [selected]);

  // While the sheet is open, a tap outside it must ONLY dismiss - never
  // open whatever it landed on (an image viewer, a file download, another
  // bubble's selection). Mounted for the bubble's whole lifetime: the
  // dismissal re-render above must not tear this down between the
  // mousedown and the click of the same tap, so the check runs against a
  // ref plus a short bridge window after the dismissal.
  const selectedRef = useRef(false);
  selectedRef.current = selected;
  const suppressUntilRef = useRef(0);
  useEffect(() => {
    function handleClickCapture(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest("[data-message-sheet]")) return;
      if (!selectedRef.current && performance.now() > suppressUntilRef.current) return;
      e.preventDefault();
      e.stopPropagation();
    }
    document.addEventListener("click", handleClickCapture, true);
    return () => document.removeEventListener("click", handleClickCapture, true);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  // Measured before the first paint of the selection: the bar (~44px tall
  // plus its 6px offset) must fit below the bubble INSIDE the messages
  // scroller. The scroller clips absolutely-positioned descendants at its
  // visible bottom edge regardless of scroll position, so anything past
  // that edge is off-screen and the bar flips above the bubble instead.
  useLayoutEffect(() => {
    if (!selected) return;
    const group = groupRef.current;
    if (!group) return;
    const row = group.querySelector<HTMLElement>("div.relative");
    let scroller: HTMLElement | null = group.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    const rowRect = row?.getBoundingClientRect();
    const scrollerRect = scroller?.getBoundingClientRect();
    if (!rowRect || !scrollerRect) return;
    setBarAbove(rowRect.bottom + 52 > scrollerRect.bottom);
  }, [selected]);

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

  // The desktop ⋯ dropdown closes on any outside mousedown; clicking the
  // same trigger again toggles it (the trigger is excluded below).
  useEffect(() => {
    if (!menuRect) return;
    function handleDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest("[data-message-dropdown]") || target?.closest("[data-message-menu-trigger]")) return;
      setMenuRect(null);
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [menuRect]);

  function toggleReactionPicker(rect: DOMRect) {
    setReactionAnchor((prev) => (prev ? null : rect));
    setReactionExpanded(false);
  }

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function select() {
    setSelected(true);
    setPickerOpen(false);
    onFirstInteraction?.();
  }

  function dismiss() {
    setSelected(false);
    setPickerOpen(false);
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
    // Long-press selects too (the fallback for photos, whose tap opens the
    // full-screen viewer) - touch screens only; a mouse hold on desktop
    // must never select. Any movement cancels it. When it fires, the
    // trailing click (delivered on pointer-up) must be swallowed - on a
    // photo it would open the full-screen viewer right on top of the
    // action sheet the long-press just opened.
    if (!touchUi) return;
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      navigator.vibrate?.(10);
      suppressClickRef.current = true;
      select();
    }, LONG_PRESS_MS);
  }

  function handlePressMove(e: ReactPointerEvent<HTMLDivElement>) {
    const state = swipeState.current;
    if (!state || e.pointerId !== state.pointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (state.horizontal === null && (absDx > SWIPE_START_PX || absDy > SWIPE_START_PX)) {
      clearLongPress();
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
    clearLongPress();
    const state = swipeState.current;
    swipeState.current = null;
    const wasReplySwipe = Boolean(state?.horizontal && state.touch && state.dx >= SWIPE_REPLY_PX);
    if (wasReplySwipe) {
      onReply();
      // A finished swipe must not deliver a click to the bubble (which
      // would immediately select it, or open a viewer inside it).
      suppressClickRef.current = true;
    }
    setSwipeOffset(0);
  }

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (disableActions || message.deleted || message.decryptionError) return;
    // Links, attachment cards, and embed controls keep their own behavior.
    const target = e.target as Element | null;
    if (target?.closest("a, button, video, iframe, [contenteditable]")) return;
    select();
  }

  // Capture-phase suppressor: a click that follows a long-press (or a
  // completed reply-swipe) is swallowed before ANY descendant handler
  // sees it - otherwise long-pressing a photo would open its full-screen
  // viewer on top of the action sheet.
  function handleClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.text);
      showToast({ title: "Copied", message: "", tone: "success" });
    } catch {
      showToast({ title: "Copy failed", message: "Your browser blocked clipboard access.", tone: "error" });
    }
    dismiss();
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
    dismiss();
  }

  const html = message.deleted || message.decryptionError ? null : renderMessageMarkdown(message.text);

  // A message that is ONLY photos renders each image as its own rounded
  // frame instead of one shared bubble rectangle: the shared wrapper used
  // to take the widest image's width and draw that rectangle around every
  // photo, so a portrait image next to a panorama looked like it was
  // stretched into the panorama's box.
  const attachmentInfos = useMemo(
    () =>
      message.attachments.map((a) => {
        const meta = decryptAttachmentMeta(conversationKey, a.meta);
        return { attachment: a, meta, kind: meta ? previewKind(meta.mimetype, meta.filename) : "binary" };
      }),
    [message.attachments, conversationKey],
  );
  const attachmentKinds = attachmentInfos.map((info) => info.kind);
  // Files (as opposed to visuals) get a Download row in the action sheet -
  // on touch their cards are inert, so the sheet is the only way to fetch
  // them.
  const downloadableAttachments = attachmentInfos.filter(
    (info) => info.kind !== "image" && info.kind !== "video" && info.kind !== "audio",
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

  // Shared pointer wiring for swipe-to-reply + long-press-select.
  // touch-action pan-y keeps vertical scrolling native while horizontal
  // drags reach these handlers.
  const pressHandlers = {
    onPointerDown: handlePressStart,
    onPointerMove: handlePressMove,
    onPointerUp: handlePressEnd,
    onPointerCancel: handlePressEnd,
    onClickCapture: handleClickCapture,
  };

  const canShowActions = !disableActions && !message.deleted && !message.decryptionError;

  // Full-screen viewers get their own ⋯ menu with the same actions, so a
  // preview never inherits the bubble's tap-to-select.
  const viewerActions: ViewerActions | undefined = canShowActions
    ? { canEdit: isOwn && canEdit, onReply, onEdit, onDelete, onReact }
    : undefined;

  const quickReactBar = selected && canShowActions && (
    <div
      data-message-sheet
      // Below the bubble normally; flips above when the bubble sits at the
      // very bottom of the thread and a below-bar would be clipped off
      // the end of the scrollable content.
      className={clsx(
        "absolute z-[60] flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-1 shadow-lg",
        barAbove ? "bottom-full mb-1.5" : "top-full mt-1.5",
        isOwn ? "right-0" : "left-0",
      )}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React ${emoji}`}
          onClick={() => pickReaction(emoji)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none hover:bg-[var(--surface-muted)]"
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        aria-label="More reactions"
        onClick={() => setPickerOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
      >
        <SmilePlus size={18} aria-hidden />
      </button>
    </div>
  );

  const messageActionsProps = {
    disableActions,
    reactionActive: reactionAnchor !== null,
    menuOpen: menuRect !== null,
    onToggleReaction: toggleReactionPicker,
    onReply,
    onOpenMenu: (rect: DOMRect) => setMenuRect((prev) => (prev ? null : rect)),
  };

  // One list drives both renderings: an icon-only row on touch (over the
  // conversation navbar) and the labeled vertical list on pointer devices.
  const sheetItems: SheetItem[] = [
    { key: "reply", icon: <Reply size={18} aria-hidden />, label: "Reply", onClick: () => { dismiss(); onReply(); } },
    ...(message.text.trim().length > 0
      ? [{ key: "copy", icon: <Copy size={18} aria-hidden />, label: "Copy", onClick: () => void copyText() }]
      : []),
    ...downloadableAttachments.map(({ attachment, meta }) => ({
      key: `download-${attachment.id}`,
      icon: <Download size={18} aria-hidden />,
      label: `Download ${meta?.filename ?? "file"}`,
      onClick: () => {
        setDownloadRequests((prev) => ({ ...prev, [attachment.id]: (prev[attachment.id] ?? 0) + 1 }));
        dismiss();
      },
    })),
    ...(isOwn && canEdit
      ? [{ key: "edit", icon: <Pencil size={18} aria-hidden />, label: "Edit", onClick: () => { dismiss(); onEdit(); } }]
      : []),
    {
      key: "delete",
      icon: <Trash2 size={18} aria-hidden />,
      label: "Delete",
      destructive: true,
      onClick: () => { dismiss(); onDelete(); },
    },
    { key: "cancel", icon: <X size={18} aria-hidden />, label: "Cancel", onClick: dismiss },
  ];

  const actionSheet =
    selected &&
    canShowActions &&
    createPortal(
      <div
        data-message-sheet
        className="pointer-events-none fixed inset-0 z-50 md:flex md:items-center md:justify-center md:p-4"
        role="presentation"
      >
        {/* The whole overlay is pointer-events-none so taps fall straight
            through: tapping another message dismisses this selection AND
            selects the tapped one in a single tap (the document mousedown
            listener handles the dismissal), and the dimmed backdrop is
            purely visual. Only the panel below re-enables pointer events. */}
        <div className="pointer-events-none absolute inset-0 bg-black/40 md:bg-black/50 md:backdrop-blur-sm" />
        <section
          role="dialog"
          aria-label="Message actions"
          className={clsx(
            // Touch: pinned to the TOP, covering the conversation navbar -
            // a bottom drawer used to cover messages near the bottom of
            // the thread. Icons only, one horizontal row.
            "pointer-events-auto absolute inset-x-0 top-0 border-b border-[var(--border)] bg-[var(--surface-raised)] pt-[env(safe-area-inset-top)] shadow-xl",
            "md:relative md:inset-auto md:w-72 md:rounded-2xl md:border md:pt-0",
          )}
        >
          {pickerOpen ? (
            <div className="mx-auto max-h-[52vh] w-[min(340px,100%)] overflow-y-auto md:max-h-[60vh]">
              <EmojiPicker
                embedded
                onClose={() => setPickerOpen(false)}
                onSelect={(emoji) => {
                  pickReaction(emoji);
                  dismiss();
                }}
              />
            </div>
          ) : (
            <>
              {/* Touch: the X alone on the LEFT, the action icons clustered
                  on the RIGHT with generous spacing. */}
              <div className="flex items-center overflow-x-auto px-2 py-1.5 md:hidden">
                {(() => {
                  const cancel = sheetItems.find((item) => item.key === "cancel");
                  if (!cancel) return null;
                  return (
                    <button
                      type="button"
                      aria-label={cancel.label}
                      title={cancel.label}
                      onClick={cancel.onClick}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text)] hover:bg-[var(--surface-muted)]"
                    >
                      {cancel.icon}
                    </button>
                  );
                })()}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {sheetItems
                    .filter((item) => item.key !== "cancel")
                    .map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        aria-label={item.label}
                        title={item.label}
                        onClick={item.onClick}
                        className={clsx(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--surface-muted)]",
                          item.destructive ? "text-[var(--danger-fg)]" : "text-[var(--text)]",
                        )}
                      >
                        {item.icon}
                      </button>
                    ))}
                </div>
              </div>
              <div className="hidden p-2 md:block">
                {sheetItems.map((item) => (
                  <SheetAction
                    key={item.key}
                    icon={item.icon}
                    label={item.label}
                    destructive={item.destructive}
                    onClick={item.onClick}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>,
      document.body,
    );

  return (
    <div
      ref={groupRef}
      className={clsx(
        "group flex flex-col gap-1 [touch-action:pan-y]",
        isOwn ? "items-end" : "items-start",
        // Selected messages float ABOVE the dim overlay (z-50): the bubble
        // stays bright while the rest of the thread is behind the shade.
        selected && canShowActions && "relative z-[60]",
      )}
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
          <div className={clsx("relative flex min-w-0 max-w-full items-end gap-1", selected && canShowActions && "rounded-2xl ring-2 ring-[var(--color-accent-500)]")}>
            {isOwn && <HoverActions {...messageActionsProps} />}
            <div
              className={clsx(
                "min-w-0 max-w-full space-y-2",
                touchUi && "cursor-pointer active:ring-2 active:ring-[var(--color-accent-500)]",
                selected && canShowActions && "rounded-2xl",
              )}
              onClick={touchUi ? handleTap : undefined}
            >
              {message.attachments.map((a) => (
                <AttachmentPreview
                  key={a.id}
                  attachment={a}
                  conversationKey={conversationKey}
                  downloadUrl={attachmentUrlFor(a.id)}
                  standalone
                  downloadRequest={downloadRequests[a.id] ?? 0}
                  viewerActions={viewerActions}
                />
              ))}
            </div>
            {!isOwn && <HoverActions {...messageActionsProps} />}
            {quickReactBar}
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
          <div className="relative flex min-w-0 max-w-[80%] items-end gap-1">
            {isOwn && <HoverActions {...messageActionsProps} />}

            <div
              // On touch/small screens the whole bubble is the tap target;
              // on desktop it stays an inert, fully selectable text block
              // (no cursor-pointer, no press animation) so text can be
              // dragged and copied like anywhere else.
              onClick={touchUi ? handleTap : undefined}
              className={clsx(
                // min-w-0: this is a flex item (the row above is `flex`), and a
                // flex item's default min-width is `auto` - i.e. it refuses to
                // shrink below its content's intrinsic width. Without this, a
                // long unbroken string overrides max-w-[80%] entirely instead
                // of wrapping, since the bubble never gets small enough for
                // .prose-message's own overflow-wrap to kick in.
                "min-w-0 max-w-full overflow-hidden rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                touchUi && "cursor-pointer transition-transform active:scale-[0.98]",
                // The ring lights up the instant the finger lands on the
                // bubble (active), and stays while the message is selected.
                touchUi && "active:ring-2 active:ring-[var(--color-accent-500)]",
                selected && canShowActions && "ring-2 ring-[var(--color-accent-500)]",
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
                          downloadRequest={downloadRequests[a.id] ?? 0}
                          viewerActions={viewerActions}
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

            {!isOwn && <HoverActions {...messageActionsProps} />}
            {quickReactBar}
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

      {actionSheet}

      {/* Desktop ⋯ dropdown: anchored to the button that opened it, no
          backdrop, no blur - opens downward unless it would run off the
          bottom of the screen, in which case it opens upward. */}
      {menuRect &&
        canShowActions &&
        createPortal(
          <MessageDropdown
            anchorRect={menuRect}
            items={[
              { icon: <Reply size={15} aria-hidden />, label: "Reply", onClick: () => { setMenuRect(null); onReply(); } },
              ...(message.text.trim().length > 0
                ? [{ icon: <Copy size={15} aria-hidden />, label: "Copy", onClick: () => { setMenuRect(null); void copyText(); } }]
                : []),
              ...(isOwn && canEdit
                ? [{ icon: <Pencil size={15} aria-hidden />, label: "Edit", onClick: () => { setMenuRect(null); onEdit(); } }]
                : []),
              {
                icon: <Trash2 size={15} aria-hidden />,
                label: "Delete",
                destructive: true,
                onClick: () => { setMenuRect(null); onDelete(); },
              },
            ]}
            onClose={() => setMenuRect(null)}
          />,
          document.body,
        )}
    </div>
  );
}

interface DropdownItemSpec {
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}

interface SheetItem {
  key: string;
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}

const DROPDOWN_WIDTH_PX = 184;
const DROPDOWN_ITEM_HEIGHT_PX = 38;
const DROPDOWN_PADDING_PX = 8;

/**
 * Small anchored action menu for the desktop hover ⋯ button. Clamped
 * horizontally inside the viewport and flipped upward automatically when
 * there isn't enough room below the anchor.
 */
function MessageDropdown({
  anchorRect,
  items,
  onClose,
}: {
  anchorRect: DOMRect;
  items: DropdownItemSpec[];
  onClose: () => void;
}) {
  // +1 row for the Cancel entry at the bottom.
  const estimatedHeight = (items.length + 1) * DROPDOWN_ITEM_HEIGHT_PX + DROPDOWN_PADDING_PX;
  const left = Math.min(
    Math.max(8, anchorRect.right - DROPDOWN_WIDTH_PX),
    window.innerWidth - DROPDOWN_WIDTH_PX - 8,
  );
  const opensDown = anchorRect.bottom + 8 + estimatedHeight <= window.innerHeight;
  const top = opensDown ? anchorRect.bottom + 8 : Math.max(8, anchorRect.top - estimatedHeight - 8);

  return createPortal(
    <div
      data-message-dropdown
      role="menu"
      aria-label="Message actions"
      className="fixed z-50 w-[184px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] py-1 shadow-xl"
      style={{ top, left }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={item.onClick}
          className={clsx(
            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]",
            item.destructive ? "text-[var(--danger-fg)]" : "text-[var(--text)]",
          )}
        >
          <span className="shrink-0 opacity-80">{item.icon}</span>
          {item.label}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        onClick={onClose}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
      >
        <span className="shrink-0 opacity-80">
          <X size={15} aria-hidden />
        </span>
        Cancel
      </button>
    </div>,
    document.body,
  );
}

function SheetAction({
  icon,
  label,
  destructive = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-[var(--surface-muted)]",
        destructive ? "text-[var(--danger-fg)]" : "text-[var(--text)]",
      )}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      {label}
    </button>
  );
}

/**
 * Desktop hover actions: React (floating quick-react overlay), Reply, and
 * the overflow menu that opens the same action sheet a tap opens on
 * mobile. Hidden below md - touch screens use tap-to-select instead.
 */
function HoverActions({
  disableActions,
  reactionActive,
  menuOpen,
  onToggleReaction,
  onReply,
  onOpenMenu,
}: {
  disableActions: boolean;
  reactionActive: boolean;
  menuOpen: boolean;
  onToggleReaction: (rect: DOMRect) => void;
  onReply: () => void;
  onOpenMenu: (rect: DOMRect) => void;
}) {
  return (
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
      <button
        type="button"
        data-message-menu-trigger
        title="More options"
        aria-label="More options"
        aria-expanded={menuOpen}
        disabled={disableActions}
        onClick={(e) => onOpenMenu(e.currentTarget.getBoundingClientRect())}
        className="rounded p-1.5 text-xs hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <EllipsisVertical size={14} aria-hidden />
      </button>
    </div>
  );
}
