import { useEffect, useRef } from "react";
import type { CannedReplyDto } from "@anonchat/shared";

interface Props {
  matches: CannedReplyDto[];
  selectedIndex: number;
  /** Fixed-position anchor, already computed above the text cursor (see
   *  Composer.tsx's computeOverlayPosition - shared with the emoji
   *  :shortcode: overlay). */
  top: number;
  left: number;
  onSelect: (reply: CannedReplyDto) => void;
}

/**
 * "/template" popup: a vertical list (unlike EmojiShortcutOverlay's
 * horizontal glyph strip - titles and body previews need real width, not a
 * row of icons), navigated with Up/Down instead of Left/Right. Selecting a
 * template fills its body into the composer instead of sending immediately,
 * so the admin can still edit it before sending.
 */
export function CannedReplySlashOverlay({ matches, selectedIndex, top, left, onSelect }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedIndex]);

  if (matches.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Template suggestions"
      className="fixed z-20 -translate-y-full"
      style={{ top, left }}
    >
      <div className="max-h-64 w-72 max-w-[min(90vw,20rem)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-lg">
        {matches.map((reply, i) => (
          <button
            key={reply.id}
            ref={i === selectedIndex ? selectedRef : undefined}
            type="button"
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              // mousedown beats the textarea's blur, same reasoning as
              // EmojiShortcutOverlay's onSelect handler.
              e.preventDefault();
              onSelect(reply);
            }}
            className={`block w-full rounded-xl px-4 py-2 text-left outline-none hover:bg-[var(--surface-muted)] ${
              i === selectedIndex ? "bg-[var(--selected-bg)]" : ""
            }`}
          >
            <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
              <span aria-hidden className="text-[var(--text-muted)]">/</span>
              <span className="truncate">{reply.title}</span>
            </p>
            <p className="truncate text-xs text-[var(--text-muted)]">{reply.body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
