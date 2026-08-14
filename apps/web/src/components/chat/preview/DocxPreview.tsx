import { useEffect, useState } from "react";
import DOMPurify from "dompurify";

interface Props {
  bytes: Uint8Array<ArrayBuffer>;
  fullScreen?: boolean;
}

type State = { kind: "loading" } | { kind: "ready"; html: string } | { kind: "error" };

// Only .docx (OOXML) is supported - mammoth can't read the legacy binary
// .doc format, and there's no lightweight, actively-maintained client-side
// library for it. A .doc attachment falls back to the generic download
// button in AttachmentPreview.tsx, same as any other unrecognized type.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "blockquote",
  "code",
  "pre",
  "hr",
  "span",
];

export function DocxPreview({ bytes, fullScreen = false }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    // Dynamically imported: mammoth (+ its jszip/xml dependencies) only
    // needs to load when a .docx attachment is actually being previewed,
    // not as part of the app's main bundle.
    import("mammoth")
      .then((mammoth) => mammoth.convertToHtml({ arrayBuffer: bytes.buffer }))
      .then((result) => {
        if (cancelled) return;
        // mammoth's output is untrusted document content - same sanitizing
        // discipline as message markdown, not a lesser trust level just
        // because it came from a file rather than typed text.
        const clean = DOMPurify.sanitize(result.value, { ALLOWED_TAGS, ALLOWED_ATTR: ["href", "src", "alt", "title"] });
        setState({ kind: "ready", html: clean });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  if (state.kind === "loading") {
    return <p className="text-xs text-[var(--text-muted)]">Rendering document…</p>;
  }
  if (state.kind === "error") {
    return <p className="text-xs text-[var(--danger-fg)]">Couldn't render a preview of this document.</p>;
  }
  return (
    <div
      className={`prose-message overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] ${fullScreen ? "min-h-full" : "max-h-96"}`}
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  );
}
