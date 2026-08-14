import { useMemo } from "react";
import { ensureLanguagesRegistered } from "../codeLanguages.js";

interface Props {
  bytes: Uint8Array<ArrayBuffer>;
  language: string;
}

const MAX_HIGHLIGHT_CHARS = 200_000;

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
  const content = useMemo(() => {
    const fullText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    // Syntax highlighting a multi-megabyte file can create hundreds of
    // thousands of span nodes and lock the tab. Keep the entire file
    // available in the local scroller, but fall back to one plain text node
    // once it crosses the safe highlighting threshold.
    if (fullText.length > MAX_HIGHLIGHT_CHARS) return { text: fullText, html: null };
    const hljs = ensureLanguagesRegistered();
    const highlighted =
      language !== "plaintext" && hljs.getLanguage(language)
        ? hljs.highlight(fullText, { language, ignoreIllegals: true }).value
        : escapeHtml(fullText);
    return { text: fullText, html: highlighted };
  }, [bytes, language]);

  return (
    <pre className="prose-message m-0 max-h-80 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text)]">
      {content.html === null ? (
        <code className={`language-${language}`}>{content.text}</code>
      ) : (
        <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: content.html }} />
      )}
    </pre>
  );
}
