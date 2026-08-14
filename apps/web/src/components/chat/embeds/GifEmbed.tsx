import { useEffect, useState } from "react";
import { getLinkPreview } from "../../../api/linkPreview.js";

type State = { kind: "loading" } | { kind: "ready"; src: string } | { kind: "none" };

/**
 * Renders an actual (animated) GIF inline for a Tenor/GIPHY share link or a
 * bare .gif URL - reuses the same SSRF-guarded /api/link-preview fetch as
 * LinkPreviewCard (see fetchLinkPreview.ts), since CSP's img-src is
 * 'self'/data:/blob: only and a raw third-party URL could never be set
 * directly as this <img>'s src. Renders nothing while loading and on
 * failure/non-gif-result, same convention as LinkPreviewCard - a missing
 * embed should look like the plain linkified URL, never a broken-image icon
 * or a layout gap.
 */
export function GifEmbed({ url }: { url: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void getLinkPreview(url)
      .then((preview) => {
        if (cancelled) return;
        // The data: URI's own declared type is the source of truth for
        // "is this actually a gif" - a Tenor/Giphy page occasionally has no
        // og:image, or one that isn't image/gif, and this URL only looked
        // like a gif share link from its hostname.
        setState(
          preview?.image?.startsWith("data:image/gif") ? { kind: "ready", src: preview.image } : { kind: "none" },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.kind !== "ready") return null;

  return (
    <img
      src={state.src}
      alt="GIF"
      className="max-h-64 max-w-sm rounded-lg border border-[var(--border)] object-contain"
    />
  );
}
