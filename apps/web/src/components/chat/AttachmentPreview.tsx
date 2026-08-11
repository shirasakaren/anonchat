import { useEffect, useState } from "react";
import { decryptBlob } from "@termine/crypto";
import type { AttachmentDto } from "@termine/shared";
import { decryptAttachmentMeta, toBlobPart, type AttachmentMetaEnvelope } from "../../crypto/conversationCrypto.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconForMime(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "🖼️";
  if (mimetype.startsWith("video/")) return "🎞️";
  if (mimetype.startsWith("audio/")) return "🎵";
  if (mimetype === "application/pdf") return "📄";
  return "📎";
}

interface Props {
  attachment: AttachmentDto;
  conversationKey: Uint8Array;
  downloadUrl: string;
}

type LoadState = { kind: "idle" } | { kind: "loading" } | { kind: "loaded"; url: string; mimetype: string } | { kind: "error" };

export function AttachmentPreview({ attachment, conversationKey, downloadUrl }: Props) {
  const [meta, setMeta] = useState<AttachmentMetaEnvelope | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    setMeta(decryptAttachmentMeta(conversationKey, attachment.meta));
  }, [attachment.meta, conversationKey]);

  useEffect(() => {
    return () => {
      if (state.kind === "loaded") URL.revokeObjectURL(state.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind === "loaded" ? state.url : null]);

  async function load() {
    if (!meta) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(downloadUrl, { credentials: "include" });
      if (!res.ok) throw new Error("download failed");
      const raw = new Uint8Array(await res.arrayBuffer());
      const plaintext = toBlobPart(decryptBlob(conversationKey, raw));
      const blob = new Blob([plaintext], { type: meta.mimetype });
      setState({ kind: "loaded", url: URL.createObjectURL(blob), mimetype: meta.mimetype });
    } catch {
      setState({ kind: "error" });
    }
  }

  if (!meta) return null;

  if (state.kind === "loaded") {
    if (state.mimetype.startsWith("image/")) {
      return <img src={state.url} alt={meta.filename} className="max-h-64 rounded-lg" />;
    }
    if (state.mimetype.startsWith("video/")) {
      return <video src={state.url} controls className="max-h-64 rounded-lg" />;
    }
    if (state.mimetype.startsWith("audio/")) {
      return <audio src={state.url} controls className="w-full" />;
    }
    if (state.mimetype === "application/pdf") {
      return (
        <div className="space-y-1">
          <iframe title={meta.filename} src={state.url} className="h-64 w-full rounded-lg border border-[var(--border)]" />
          <a href={state.url} download={meta.filename} className="text-xs underline">
            Download {meta.filename}
          </a>
        </div>
      );
    }
    return (
      <a href={state.url} download={meta.filename} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
        <span>{iconForMime(state.mimetype)}</span>
        <span className="truncate">{meta.filename}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={load}
      disabled={state.kind === "loading"}
      className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)] disabled:opacity-60"
    >
      <span>{iconForMime(meta.mimetype)}</span>
      <span className="min-w-0 flex-1 truncate">{meta.filename}</span>
      <span className="text-xs text-[var(--text-muted)]">{formatBytes(meta.size)}</span>
      <span className="text-xs text-[var(--color-accent-600)]">{state.kind === "loading" ? "Loading…" : state.kind === "error" ? "Retry" : "Preview"}</span>
    </button>
  );
}
