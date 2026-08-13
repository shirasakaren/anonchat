import { useEffect, useState } from "react";
import type { LinkPreviewDto } from "@anonchat/shared";
import { getLinkPreview } from "../../../api/linkPreview.js";

type State = { kind: "loading" } | { kind: "ready"; preview: LinkPreviewDto } | { kind: "none" };

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Renders nothing while loading and nothing on failure/no-metadata - a
 *  missing preview should never leave a visible gap or error in the
 *  middle of a sent message, it should just look like the plain linkified
 *  URL text did all along. */
export function LinkPreviewCard({ url }: { url: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getLinkPreview(url).then((preview) => {
      if (cancelled) return;
      setState(preview ? { kind: "ready", preview } : { kind: "none" });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.kind !== "ready") return null;
  const { preview } = state;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="flex max-w-sm gap-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 hover:bg-[var(--surface-muted)]"
    >
      {preview.image && (
        <img src={preview.image} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          {preview.siteName || hostnameOf(preview.url)}
        </p>
        {preview.title && <p className="truncate text-sm font-semibold">{preview.title}</p>}
        {preview.description && <p className="line-clamp-2 text-xs text-[var(--text-muted)]">{preview.description}</p>}
      </div>
    </a>
  );
}
