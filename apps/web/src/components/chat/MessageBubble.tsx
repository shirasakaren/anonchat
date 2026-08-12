import { useMemo, useState } from "react";
import clsx from "clsx";
import { format } from "date-fns";
import { SmilePlus, Reply, Pencil, Trash2 } from "lucide-react";
import { decryptReaction } from "../../crypto/conversationCrypto.js";
import { renderMessageMarkdown } from "./markdown.js";
import { AttachmentPreview } from "./AttachmentPreview.js";
import type { DisplayMessage } from "./types.js";

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface Props {
  message: DisplayMessage;
  isOwn: boolean;
  conversationKey: Uint8Array;
  attachmentUrlFor: (attachmentId: string) => string;
  replyPreview?: string;
  canEdit: boolean;
  disableActions?: boolean;
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
  replyPreview,
  canEdit,
  disableActions = false,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onRetry,
}: Props) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);

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

  const html = message.deleted ? null : renderMessageMarkdown(message.text);

  return (
    <div className={clsx("group flex flex-col gap-1", isOwn ? "items-end" : "items-start")}>
      {replyPreview && (
        <div
          className={clsx(
            "max-w-[80%] truncate rounded-md border-l-2 px-2 py-1 text-xs text-[var(--text-muted)]",
            "border-[var(--color-accent-400)]",
          )}
        >
          {replyPreview}
        </div>
      )}

      <div className="flex max-w-[80%] items-end gap-1">
        {isOwn && (
          <MessageActions
            canEdit={canEdit}
            isOwn={isOwn}
            disableActions={disableActions}
            showReactionPicker={showReactionPicker}
            setShowReactionPicker={setShowReactionPicker}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            onReact={onReact}
          />
        )}

        <div
          className={clsx(
            "rounded-2xl px-3.5 py-2 text-sm shadow-sm",
            isOwn
              ? "bg-[var(--bubble-user)] text-[var(--bubble-user-text)]"
              : "bg-[var(--bubble-admin)] text-[var(--bubble-admin-text)]",
          )}
        >
          {message.deleted ? (
            <p className="italic opacity-70">Message deleted</p>
          ) : (
            <>
              {message.attachments.length > 0 && (
                <div className="mb-2 space-y-2">
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
              {html && <div className="prose-message" dangerouslySetInnerHTML={{ __html: html }} />}
            </>
          )}
        </div>

        {!isOwn && (
          <MessageActions
            canEdit={canEdit}
            isOwn={isOwn}
            disableActions={disableActions}
            showReactionPicker={showReactionPicker}
            setShowReactionPicker={setShowReactionPicker}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            onReact={onReact}
          />
        )}
      </div>

      {decryptedReactions.length > 0 && (
        <div className="flex gap-1">
          {decryptedReactions.map((r, i) => (
            <span key={i} className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs" title={r.senderType}>
              {r.emoji}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--text-muted)]">
        <span>{format(new Date(message.createdAt), "p")}</span>
        {message.edited && !message.deleted && <span>· edited</span>}
        {isOwn && message.status === "sending" && <span>· Sending…</span>}
        {isOwn && message.status === "failed" && (
          <button type="button" onClick={onRetry} className="text-red-500 underline">
            Failed · Retry
          </button>
        )}
        {isOwn && message.status === "sent" && message.readAt && <span>· Read</span>}
      </div>

      {showReactionPicker && (
        <div className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 shadow-sm">
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(myReaction?.emoji === emoji ? null : emoji);
                setShowReactionPicker(false);
              }}
              className="rounded p-1 text-base hover:bg-[var(--surface-muted)]"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageActions({
  canEdit,
  isOwn,
  disableActions,
  showReactionPicker,
  setShowReactionPicker,
  onReply,
  onEdit,
  onDelete,
  onReact: _onReact,
}: {
  canEdit: boolean;
  isOwn: boolean;
  disableActions: boolean;
  showReactionPicker: boolean;
  setShowReactionPicker: (v: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string | null) => void;
}) {
  return (
    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        title="React"
        disabled={disableActions}
        onClick={() => setShowReactionPicker(!showReactionPicker)}
        className="rounded p-1 text-xs hover:bg-[var(--surface-muted)] disabled:pointer-events-none disabled:opacity-40"
      >
        <SmilePlus size={14} aria-hidden />
      </button>
      <button
        type="button"
        title="Reply"
        onClick={onReply}
        className="rounded p-1 text-xs hover:bg-[var(--surface-muted)]"
      >
        <Reply size={14} aria-hidden />
      </button>
      {isOwn && canEdit && (
        <button
          type="button"
          title="Edit"
          disabled={disableActions}
          onClick={onEdit}
          className="rounded p-1 text-xs hover:bg-[var(--surface-muted)] disabled:pointer-events-none disabled:opacity-40"
        >
          <Pencil size={14} aria-hidden />
        </button>
      )}
      {isOwn && (
        <button
          type="button"
          title="Delete"
          disabled={disableActions}
          onClick={onDelete}
          className="rounded p-1 text-xs hover:bg-[var(--surface-muted)] disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
