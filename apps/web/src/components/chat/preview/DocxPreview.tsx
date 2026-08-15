import { useEffect, useRef, useState } from "react";

interface Props {
  bytes: Uint8Array<ArrayBuffer>;
  fullScreen?: boolean;
}

type State = { kind: "loading" } | { kind: "ready" } | { kind: "error" };

// Only OOXML documents (.docx and friends) are supported - the legacy
// binary .doc format has no client-side renderer here and falls back to
// the generic download button in AttachmentPreview.tsx.
const RENDER_OPTIONS = {
  inWrapper: true,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  breakPages: true,
  ignoreLastRenderedPageBreak: false,
  experimental: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  useBase64URL: true,
  renderChanges: true,
  renderComments: false,
};

/**
 * docx-preview builds the preview with DOM APIs, but the document itself is
 * attacker-controllable content (a .docx is just a zip of XML). This pass
 * applies the same discipline as message markdown: links open safely in a
 * new tab and only http(s)/mailto survives, and any script/event attributes
 * are dropped outright.
 */
function hardenRenderedDocument(container: HTMLElement): void {
  for (const el of Array.from(container.querySelectorAll("script, style, iframe, object, embed, link"))) el.remove();
  for (const el of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
    }
  }
  for (const a of Array.from(container.querySelectorAll("a"))) {
    const href = a.getAttribute("href") ?? "";
    const allowed = /^(https?:|mailto:)/i.test(href);
    if (!allowed) {
      a.removeAttribute("href");
      continue;
    }
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer nofollow");
  }
}

/**
 * Paginated, PDF-like .docx preview. docx-preview re-lays the document out
 * page by page (margins, page breaks, headers/footers, tables, images)
 * instead of flattening it to flowing HTML, so the visual formatting stays
 * true to how Word renders it.
 */
export function DocxPreview({ bytes, fullScreen = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const container = containerRef.current;
    if (!container) return;
    // Dynamically imported: docx-preview (+ its jszip dependency) only
    // needs to load when a .docx attachment is actually being previewed,
    // not as part of the app's main bundle.
    import("docx-preview")
      .then(async (docx) => {
        container.replaceChildren();
        await docx.renderAsync(bytes, container, undefined, RENDER_OPTIONS);
        hardenRenderedDocument(container);
        if (!cancelled) setState({ kind: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  return (
    <div className="relative w-full min-w-0 max-w-full">
      {state.kind === "loading" && (
        <p className="p-3 text-xs text-[var(--text-muted)]">Rendering document…</p>
      )}
      {state.kind === "error" && (
        <p className="p-3 text-xs text-[var(--danger-fg)]">Couldn't render a preview of this document.</p>
      )}
      <div
        ref={containerRef}
        className={`docx-preview w-full min-w-0 max-w-full overflow-auto overscroll-contain ${
          fullScreen ? "min-h-full" : "max-h-96"
        }`}
      />
    </div>
  );
}
