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
      className={`prose-message w-full min-w-0 max-w-full overflow-auto overscroll-contain rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] ${fullScreen ? "min-h-full" : "max-h-80"}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
