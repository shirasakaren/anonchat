import { useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ensureLanguagesRegistered } from "../codeLanguages.js";

interface Props {
  bytes: Uint8Array<ArrayBuffer>;
  language: string;
}

const MAX_CHARS = 200_000;
const COLLAPSED_MAX_HEIGHT_PX = 320;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Reuses the same highlight.js registration and CSS as chat-message code
 *  blocks (codeLanguages.ts, .prose-message .hljs-* in index.css) so a
 *  previewed .py/.json/.yaml/etc attachment looks identical to a fenced
 *  code block someone pasted directly into a message. highlight.js's
 *  highlight() always HTML-escapes its input before wrapping tokens in
 *  spans - same guarantee the markdown.ts code-block renderer already
 *  relies on - so `html` below is safe to render either branch. */
export function TextCodePreview({ bytes, language }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLPreElement>(null);

  const { html, truncated } = useMemo(() => {
    const fullText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const isTruncated = fullText.length > MAX_CHARS;
    const text = isTruncated ? fullText.slice(0, MAX_CHARS) : fullText;
    const hljs = ensureLanguagesRegistered();
    const highlighted =
      language !== "plaintext" && hljs.getLanguage(language)
        ? hljs.highlight(text, { language, ignoreIllegals: true }).value
        : escapeHtml(text);
    return { html: highlighted, truncated: isTruncated };
  }, [bytes, language]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (el) setOverflowing(el.scrollHeight > COLLAPSED_MAX_HEIGHT_PX + 1);
  }, [html]);

  const clamped = !expanded && overflowing;

  return (
    <div>
      <pre
        ref={contentRef}
        className={clsx(
          "prose-message m-0 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs",
          clamped && "overflow-hidden",
        )}
        style={clamped ? { maxHeight: COLLAPSED_MAX_HEIGHT_PX } : undefined}
      >
        <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      {(overflowing || truncated) && (
        <div className="mt-1 flex items-center gap-3 text-xs">
          {overflowing && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="font-semibold underline opacity-80 hover:opacity-100"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
          {truncated && <span className="text-[var(--text-muted)]">Truncated - download the file to see the rest.</span>}
        </div>
      )}
    </div>
  );
}
