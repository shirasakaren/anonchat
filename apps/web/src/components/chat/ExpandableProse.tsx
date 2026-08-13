import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";

const COLLAPSED_MAX_HEIGHT_PX = 320;

/**
 * Clamps very long rendered messages to a fixed height with a "See
 * more"/"See less" toggle, instead of truncating the markdown source
 * itself - slicing raw markdown risks cutting an unclosed code fence or
 * emphasis marker mid-syntax and rendering garbage. `useLayoutEffect`
 * (not `useEffect`) measures before the browser paints, so a long message
 * never flashes fully expanded before collapsing.
 */
export function ExpandableProse({ html }: { html: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > COLLAPSED_MAX_HEIGHT_PX + 1);
  }, [html]);

  const clamped = !expanded && overflowing;

  return (
    <div>
      <div
        ref={contentRef}
        className={clsx("prose-message", clamped && "overflow-hidden")}
        style={clamped ? { maxHeight: COLLAPSED_MAX_HEIGHT_PX } : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {overflowing && (
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
