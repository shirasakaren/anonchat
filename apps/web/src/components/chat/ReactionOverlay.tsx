import { useLayoutEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { EmojiPicker } from "./emoji/EmojiPicker.js";

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

interface Props {
  /** The React button's own rect, captured on click - anchors this overlay
   *  directly above it regardless of where in the message list it is. */
  anchorRect: DOMRect;
  expanded: boolean;
  onExpand: () => void;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/** Prefers floating above the anchor (the usual reaction-picker spot); a
 *  message near the top of a scrolled thread often doesn't have room for
 *  that (the expanded picker alone is ~380px tall), so this flips to below
 *  the anchor instead of running off the top of the viewport - the same
 *  collision-aware placement Discord/Slack's own reaction pickers use.
 *  Takes the overlay's *actual* rendered size (see the measure effect
 *  below), not a guessed constant - guessed width/height drift from
 *  reality (font metrics, the quick row's emoji count) in exactly the way
 *  that quietly pushes a "clamped" overlay off the opposite edge instead. */
function computePosition(anchorRect: DOMRect, width: number, height: number): { top: number; left: number } {
  const left = Math.min(Math.max(anchorRect.left, VIEWPORT_MARGIN_PX), window.innerWidth - width - VIEWPORT_MARGIN_PX);
  const spaceAbove = anchorRect.top - GAP_PX;
  const top =
    spaceAbove >= height
      ? spaceAbove - height
      : Math.min(anchorRect.bottom + GAP_PX, window.innerHeight - height - VIEWPORT_MARGIN_PX);
  return { top, left };
}

/**
 * Floating reaction picker (Discord/Slack-style), replacing the old
 * in-flow row that pushed the rest of the thread down every time it
 * opened. Starts as a compact quick-react strip; the grid icon expands it
 * in place into the same full custom EmojiPicker used elsewhere, so any
 * emoji (not just the six quick ones) can be used as a reaction.
 */
export function ReactionOverlay({ anchorRect, expanded, onExpand, onPick, onClose }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  // First paint uses a rough guess (0-sized => pinned to the anchor's own
  // top-left) since nothing's been measured yet; the layout effect below
  // corrects it against the real rendered box before the browser actually
  // paints, so this guess is never visible.
  const [pos, setPos] = useState(() => computePosition(anchorRect, 0, 0));

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos(computePosition(anchorRect, rect.width, rect.height));
    // Deliberately excludes `pos` from the recompute trigger - this only
    // needs to re-run when the anchor or expanded/collapsed state changes,
    // not every time it sets its own position (that would loop).
  }, [anchorRect, expanded]);

  return (
    <div ref={elRef} data-reaction-overlay className="fixed z-20" style={{ top: pos.top, left: pos.left }}>
      {expanded ? (
        <EmojiPicker onSelect={onPick} onClose={onClose} />
      ) : (
        <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1.5 shadow-lg">
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onPick(emoji)}
              className="rounded-full p-1.5 text-lg leading-none hover:bg-[var(--surface-muted)]"
            >
              {emoji}
            </button>
          ))}
          <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />
          <button
            type="button"
            onClick={onExpand}
            title="More emoji"
            aria-label="More emoji"
            className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          >
            <Smile size={18} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
