import { useEffect, useRef } from "react";
import type { ShortcodeMatch } from "./emojiShortcuts.js";

interface Props {
  matches: ShortcodeMatch[];
  selectedIndex: number;
  /** Fixed-position anchor, already computed above the text cursor. */
  top: number;
  left: number;
  onSelect: (match: ShortcodeMatch) => void;
}

/**
 * WhatsApp-style ":shortcode" popup: floats directly above wherever the
 * text cursor currently is (not a fixed spot in the composer - see
 * caretCoordinates.ts), shows only the emoji glyphs (no ":code:" text),
 * and scrolls horizontally only - Left/Right in the textarea (see
 * Composer.tsx) move the selection along this strip instead of moving the
 * text cursor while it's open.
 */
export function EmojiShortcutOverlay({ matches, selectedIndex, top, left, onSelect }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [selectedIndex]);

  if (matches.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Emoji suggestions"
      className="fixed z-20 -translate-y-full"
      style={{ top, left }}
    >
      <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-lg">
        <div className="flex max-w-[min(90vw,20rem)] gap-1 overflow-x-auto overflow-y-hidden scroll-smooth">
          {matches.map((match, i) => (
            <button
              key={match.code}
              ref={i === selectedIndex ? selectedRef : undefined}
              type="button"
              role="option"
              aria-selected={i === selectedIndex}
              title={`:${match.code}:`}
              onMouseDown={(e) => {
                // mousedown fires before the textarea's blur, beating the
                // cursor-move suggestion-dismiss path so it can't race it.
                e.preventDefault();
                onSelect(match);
              }}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl leading-none hover:bg-[var(--surface-muted)] ${
                i === selectedIndex ? "bg-[var(--selected-bg)]" : ""
              }`}
            >
              {match.emoji}
            </button>
          ))}
        </div>
        {/* Edge fades hint that the strip scrolls horizontally past what's
            currently visible - a plain cut-off row of tiles reads as "that's
            all of them" otherwise, especially with 6+ results. Purely
            decorative (pointer-events-none) and always rendered rather than
            conditioned on actual overflow, since results.length >= 6 is
            already the common case this overlay is designed around. */}
        <div
          className="pointer-events-none absolute inset-y-1.5 left-1.5 w-4 rounded-l-xl"
          style={{ background: "linear-gradient(to right, var(--surface-raised), transparent)" }}
        />
        <div
          className="pointer-events-none absolute inset-y-1.5 right-1.5 w-4 rounded-r-xl"
          style={{ background: "linear-gradient(to left, var(--surface-raised), transparent)" }}
        />
      </div>
    </div>
  );
}
