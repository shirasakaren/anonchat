import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  FileCode,
  FileSpreadsheet,
  Paperclip,
  ZoomIn,
  Download,
} from "lucide-react";
import { decryptBlob } from "@anonchat/crypto";
import type { AttachmentDto } from "@anonchat/shared";
import { decryptAttachmentMeta, toBlobPart, type AttachmentMetaEnvelope } from "../../crypto/conversationCrypto.js";
import { DocxPreview } from "./preview/DocxPreview.js";
import { CsvPreview } from "./preview/CsvPreview.js";
import { TextCodePreview } from "./preview/TextCodePreview.js";
import { ImageLightbox } from "./preview/ImageLightbox.js";
import { detectTextLanguage, isCsv, DOCX_MIMETYPE } from "./preview/textFileTypes.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function IconForMime({
  mimetype,
  filename,
  size = 16,
}: {
  mimetype: string;
  filename: string;
  size?: number;
}) {
  if (mimetype.startsWith("image/")) return <ImageIcon size={size} aria-hidden />;
  if (mimetype.startsWith("video/")) return <Video size={size} aria-hidden />;
  if (mimetype.startsWith("audio/")) return <Music size={size} aria-hidden />;
  if (mimetype === "application/pdf" || mimetype === DOCX_MIMETYPE) return <FileText size={size} aria-hidden />;
  if (isCsv(mimetype, filename)) return <FileSpreadsheet size={size} aria-hidden />;
  if (detectTextLanguage(mimetype, filename)) return <FileCode size={size} aria-hidden />;
  return <Paperclip size={size} aria-hidden />;
}

interface Props {
  attachment: AttachmentDto;
  conversationKey: Uint8Array;
  downloadUrl: string;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; url: string; mimetype: string; bytes: Uint8Array<ArrayBuffer> }
  | { kind: "error" };

/** Shared filename/size/Download row under every previewed (non-fallback)
 *  attachment - the E2EE promise is that the client already has the
 *  decrypted bytes once loaded, so "download" here is just handing the
 *  browser the same blob: URL already used for the preview above it, not a
 *  second server round-trip. */
function PreviewFooter({ filename, size, url }: { filename: string; size: number; url: string }) {
  return (
    <div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-70">
      <span className="min-w-0 truncate">
        {filename} · {formatBytes(size)}
      </span>
      <a href={url} download={filename} className="flex shrink-0 items-center gap-1 underline hover:opacity-100">
        <Download size={12} aria-hidden />
        Download
      </a>
    </div>
  );
}

export function AttachmentPreview({ attachment, conversationKey, downloadUrl }: Props) {
  const [meta, setMeta] = useState<AttachmentMetaEnvelope | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setMeta(decryptAttachmentMeta(conversationKey, attachment.meta));
  }, [attachment.meta, conversationKey]);

  // Images render inline in a chat by convention - decrypt and display them
  // as soon as their metadata arrives instead of waiting for a manual
  // "Preview" click. Everything else still loads on demand (some of these
  // - video, docx, csv, large text files - can be heavy and shouldn't
  // auto-start). The idle-guard makes this a one-shot: once load() flips
  // the state to "loading" this effect never re-fires.
  useEffect(() => {
    if (meta && meta.mimetype.startsWith("image/") && state.kind === "idle") {
      void load();
    }
  }, [meta, state.kind]);

  useEffect(() => {
    return () => {
      if (state.kind === "loaded") URL.revokeObjectURL(state.url);
    };
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
      setState({ kind: "loaded", url: URL.createObjectURL(blob), mimetype: meta.mimetype, bytes: plaintext });
    } catch {
      setState({ kind: "error" });
    }
  }

  if (!meta) return null;

  if (state.kind === "loaded") {
    if (state.mimetype.startsWith("image/")) {
      return (
        <>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Expand ${meta.filename}`}
            className="group relative block"
          >
            <img src={state.url} alt={meta.filename} className="max-h-64 rounded-lg" />
            <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100">
              <ZoomIn size={14} aria-hidden />
            </span>
          </button>
          {lightboxOpen && (
            <ImageLightbox url={state.url} filename={meta.filename} onClose={() => setLightboxOpen(false)} />
          )}
        </>
      );
    }
    if (state.mimetype.startsWith("video/")) {
      return (
        <div>
          <video src={state.url} controls className="max-h-64 rounded-lg" />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
        </div>
      );
    }
    if (state.mimetype.startsWith("audio/")) {
      return (
        <div>
          <audio src={state.url} controls className="w-full" />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
        </div>
      );
    }
    if (state.mimetype === "application/pdf") {
      return (
        <div>
          {/* The browser's own PDF viewer (Chrome/Firefox/Edge) already
              provides zoom/pan/print/search inside this iframe - not
              re-implemented via pdf.js, which would add a large dependency
              this already-bundle-size-conscious app doesn't need for
              functionality most browsers give for free. Safari's inline
              PDF viewer is more limited, but the Download button below
              covers that gap. */}
          <iframe
            title={meta.filename}
            src={state.url}
            className="h-64 w-full rounded-lg border border-[var(--border)]"
          />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
        </div>
      );
    }
    if (state.mimetype === DOCX_MIMETYPE) {
      return (
        <div>
          <DocxPreview bytes={state.bytes} />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
        </div>
      );
    }
    if (isCsv(state.mimetype, meta.filename)) {
      return (
        <div>
          <CsvPreview bytes={state.bytes} />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
        </div>
      );
    }
    const textLanguage = detectTextLanguage(state.mimetype, meta.filename);
    if (textLanguage) {
      return (
        <div>
          <TextCodePreview bytes={state.bytes} language={textLanguage} />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
        </div>
      );
    }
    return (
      <a
        href={state.url}
        download={meta.filename}
        className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
      >
        <IconForMime mimetype={state.mimetype} filename={meta.filename} />
        <span className="truncate">{meta.filename}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={load}
      disabled={state.kind === "loading"}
      className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:ring-1 hover:ring-inset hover:ring-[var(--border-strong)] disabled:opacity-60"
    >
      <IconForMime mimetype={meta.mimetype} filename={meta.filename} />
      <span className="min-w-0 flex-1 truncate">{meta.filename}</span>
      {/* Both spans below inherit the ambient bubble text color (set by the
          parent MessageBubble) rather than a page-level token like
          --text-muted, since this button renders on the message bubble's own
          background - a color per-theme that page-level tokens were never
          checked against. See the same reasoning on .prose-message a in
          index.css. */}
      <span className="text-xs">{formatBytes(meta.size)}</span>
      <span className="text-xs underline">
        {state.kind === "loading" ? "Loading…" : state.kind === "error" ? "Retry" : "Preview"}
      </span>
    </button>
  );
}
