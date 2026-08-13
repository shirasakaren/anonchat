import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { enhanceCodeBlocks } from "./codeBlockActions.js";
import { sanitizeLinkAttributes } from "./markdown.js";

const COLLAPSED_MAX_HEIGHT_PX = 320;

/**
 * Clamps very long rendered messages to a fixed height with a "See
 * more"/"See less" toggle, instead of truncating the markdown source
 * itself - slicing raw markdown risks cutting an unclosed code fence or
 * emphasis marker mid-syntax and rendering garbage. `useLayoutEffect`
 * (not `useEffect`) measures before the browser paints, so a long message
 * never flashes fully expanded before collapsing.
 *
 * `clamp={false}` (used by the Composer's live preview, which already
 * scrolls inside its own fixed-height box) skips the height clamp and the
 * "See more" toggle entirely, while still running the same sanitized-HTML
 * + DOM-enhancement pipeline as a sent message.
 */
export function ExpandableProse({ html, clamp = true }: { html: string; clamp?: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // No dependency array (not `[html]`): React can reset this element's
  // innerHTML on a re-render even when `html` is the same string value as
  // last time (e.g. a WS-triggered refetch produces new message objects
  // for unchanged content) - verified empirically via MutationObserver, a
  // `[html]`-keyed effect missed exactly that case and silently lost the
  // enhancements below. Re-running every commit is safe: both functions
  // below are idempotent (see their own guards) against DOM that's already
  // enhanced, so a same-content re-run is just a cheap early return.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // Both DOM-enhancement passes below run outside dangerouslySetInnerHTML
    // (see codeBlockActions.ts / markdown.ts) and must happen before the
    // height measurement - they add real height (the code-block header
    // bar), so measuring first would under-count it right at the clamp
    // boundary.
    sanitizeLinkAttributes(el);
    enhanceCodeBlocks(el);
    if (clamp) setOverflowing(el.scrollHeight > COLLAPSED_MAX_HEIGHT_PX + 1);
  });

  const clamped = clamp && !expanded && overflowing;

  return (
    <div>
      <div
        ref={contentRef}
        className={clsx("prose-message", clamped && "overflow-hidden")}
        style={clamped ? { maxHeight: COLLAPSED_MAX_HEIGHT_PX } : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {clamp && overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold underline opacity-80 hover:opacity-100"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}
