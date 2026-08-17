import { useMemo } from "react";
import { renderMessageMarkdown } from "../markdown.js";

interface Props {
  bytes: Uint8Array<ArrayBuffer>;
  fullScreen?: boolean;
}

export function MarkdownPreview({ bytes, fullScreen = false }: Props) {
  const html = useMemo(() => {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return renderMessageMarkdown(text);
  }, [bytes]);

  return (
    <div
      // Same scroller split as TextCodePreview: inside the lightbox the
      // pane scrolls (this div just grows, keeping overflow-x for wide
      // tables); inline in a bubble this div scrolls itself, capped.
      className={`prose-message w-full min-w-0 max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] ${fullScreen ? "min-h-full overflow-x-auto" : "max-h-80 overflow-auto overscroll-contain"}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
