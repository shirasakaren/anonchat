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
 * attacker-controllable content (a .docx is just a zip of XML - and
 * altChunk entries can embed HTML). This pass runs while the rendered tree
 * is still detached (nothing executes or loads off-DOM), applying the same
 * discipline as message markdown: script/style/embed nodes and event
 * attributes are dropped outright, and links open safely in a new tab with
 * only http(s)/mailto surviving.
 */
function hardenRenderedDocument(container: HTMLElement): void {
  for (const el of Array.from(container.querySelectorAll("script, style, iframe, object, embed, link, form")))
    el.remove();
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
        // Render into a detached tree first: document XML is untrusted, and
        // anything executable it could produce (scripts, event handlers,
        // iframes, javascript: links) must never touch the live DOM.
        // hardenRenderedDocument strips those while the nodes are still
        // detached, and only the cleaned nodes get moved into view.
        const detached = document.createElement("div");
        await docx.renderAsync(bytes, detached, undefined, RENDER_OPTIONS);
        hardenRenderedDocument(detached);
        container.replaceChildren(...Array.from(detached.childNodes));
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
      {state.kind === "loading" && <p className="p-3 text-xs text-[var(--text-muted)]">Rendering document…</p>}
      {state.kind === "error" && (
        <p className="p-3 text-xs text-[var(--danger-fg)]">Couldn't render a preview of this document.</p>
      )}
      <div
        ref={containerRef}
        // Same scroller split as TextCodePreview: the lightbox pane scrolls
        // the pages vertically; inline in a bubble this div scrolls itself.
        className={`docx-preview w-full min-w-0 max-w-full ${
          fullScreen ? "min-h-full overflow-x-auto" : "max-h-96 overflow-auto overscroll-contain"
        }`}
      />
    </div>
  );
}
