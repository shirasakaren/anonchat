import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Music,
  Paperclip,
  Video,
  ZoomIn,
} from "lucide-react";
import { decryptBlob, XCHACHA_NONCE_BYTES } from "@anonchat/crypto";
import type { AttachmentDto } from "@anonchat/shared";
import { decryptAttachmentMeta, toBlobPart } from "../../crypto/conversationCrypto.js";
import { deleteCachedAttachments, getCachedAttachment, putCachedAttachment } from "../../crypto/attachmentCache.js";
import { CsvPreview } from "./preview/CsvPreview.js";
import { DocumentLightbox } from "./preview/DocumentLightbox.js";
import { DocxPreview } from "./preview/DocxPreview.js";
import { ImageLightbox } from "./preview/ImageLightbox.js";
import { MarkdownPreview } from "./preview/MarkdownPreview.js";
import { TextCodePreview } from "./preview/TextCodePreview.js";
import { ThemedAudioPlayer } from "./preview/ThemedAudioPlayer.js";
import { VideoLightbox } from "./preview/VideoLightbox.js";
import { readResponseBytes } from "./preview/readResponseBytes.js";
import { detectTextLanguage, DOCX_MIMETYPE, isCsv, isMarkdown, resolveFileMimetype } from "./preview/textFileTypes.js";
import { useToast } from "../../context/ToastContext.js";
import { VideoPreviewTile } from "../common/VideoPreviewTile.js";
import { useTouchUi } from "./TapMessageHint.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PreviewKind = "image" | "video" | "audio" | "pdf" | "docx" | "csv" | "markdown" | "text" | "binary";

export function previewKind(mimetype: string, filename: string): PreviewKind {
  const effectiveMime = resolveFileMimetype(mimetype, filename);
  if (effectiveMime.startsWith("image/")) return "image";
  if (effectiveMime.startsWith("video/")) return "video";
  if (effectiveMime.startsWith("audio/")) return "audio";
  if (effectiveMime === "application/pdf") return "pdf";
  if (effectiveMime === DOCX_MIMETYPE) return "docx";
  if (isCsv(effectiveMime, filename)) return "csv";
  if (isMarkdown(filename)) return "markdown";
  if (detectTextLanguage(effectiveMime, filename)) return "text";
  return "binary";
}

export function IconForMime({ mimetype, filename, size = 16 }: { mimetype: string; filename: string; size?: number }) {
  const kind = previewKind(mimetype, filename);
  if (kind === "image") return <ImageIcon size={size} aria-hidden />;
  if (kind === "video") return <Video size={size} aria-hidden />;
  if (kind === "audio") return <Music size={size} aria-hidden />;
  if (kind === "pdf" || kind === "docx") return <FileText size={size} aria-hidden />;
  if (kind === "csv") return <FileSpreadsheet size={size} aria-hidden />;
  if (kind === "text" || kind === "markdown") return <FileCode size={size} aria-hidden />;
  return <Paperclip size={size} aria-hidden />;
}

interface Props {
  attachment: AttachmentDto;
  conversationKey: Uint8Array;
  downloadUrl: string;
  /** Image-only messages render each image without the shared message
   *  bubble wrapper - the standalone layout gives each photo its own
   *  rounded frame instead of one rectangle around the whole group. */
  standalone?: boolean;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; progress: number }
  | { kind: "loaded"; url: string; mimetype: string; bytes: Uint8Array<ArrayBuffer> }
  | { kind: "error" };

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

function CompactFileCard({
  mimetype,
  filename,
  size,
  action,
  onClick,
  disabled = false,
}: {
  mimetype: string;
  filename: string;
  size: number;
  action: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:ring-1 hover:ring-inset hover:ring-[var(--border-strong)] disabled:opacity-60"
    >
      <IconForMime mimetype={mimetype} filename={filename} />
      <span className="min-w-0 flex-1 truncate">{filename}</span>
      <span className="shrink-0 text-xs opacity-70">{formatBytes(size)}</span>
      <span className="shrink-0 text-xs underline">{action}</span>
    </button>
  );
}

function DocumentPreviewContent({
  kind,
  bytes,
  mimetype,
  filename,
  fullScreen = false,
}: {
  kind: "docx" | "csv" | "markdown" | "text";
  bytes: Uint8Array<ArrayBuffer>;
  mimetype: string;
  filename: string;
  fullScreen?: boolean;
}) {
  if (kind === "docx") return <DocxPreview bytes={bytes} fullScreen={fullScreen} />;
  if (kind === "csv") return <CsvPreview bytes={bytes} fullScreen={fullScreen} />;
  if (kind === "markdown") return <MarkdownPreview bytes={bytes} fullScreen={fullScreen} />;
  return (
    <TextCodePreview
      bytes={bytes}
      language={detectTextLanguage(mimetype, filename) ?? "plaintext"}
      fullScreen={fullScreen}
    />
  );
}

export function AttachmentPreview({ attachment, conversationKey, downloadUrl, standalone = false }: Props) {
  const { showToast } = useToast();
  // On touch/small screens the lightbox panes for documents are cramped
  // and buggy, so every non-visual format downloads directly instead -
  // only images/videos (and audio, which is a plain player) preview.
  const touchUi = useTouchUi();
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const meta = useMemo(
    () => decryptAttachmentMeta(conversationKey, attachment.meta),
    [attachment.meta, conversationKey],
  );
  const kind = meta ? previewKind(meta.mimetype, meta.filename) : "binary";
  const isTextDocument = kind === "docx" || kind === "csv" || kind === "markdown" || kind === "text";

  const load = useCallback(
    async (downloadAfterLoad = false, openDocumentAfterLoad = false) => {
      if (!meta) return;
      setState({ kind: "loading", progress: 0 });
      try {
        const fetchRaw = async (): Promise<Uint8Array<ArrayBuffer>> => {
          const response = await fetch(downloadUrl, { credentials: "include" });
          if (response.status === 429) {
            throw new Error("Too many attachments were downloaded at once. Wait a moment and try again.");
          }
          if (response.status === 404) {
            throw new Error("This attachment is no longer stored on the server.");
          }
          if (!response.ok) {
            throw new Error(`The server returned HTTP ${response.status} while downloading this file.`);
          }
          const raw = await readResponseBytes(response, attachment.sizeBytes, (progress) => {
            setState({ kind: "loading", progress });
          });
          if (raw.byteLength < XCHACHA_NONCE_BYTES) {
            throw new Error("The stored file for this attachment is empty or damaged and cannot be decrypted.");
          }
          void putCachedAttachment(attachment.id, attachment.sizeBytes, raw);
          return raw;
        };
        const decrypt = (raw: Uint8Array<ArrayBuffer>) => toBlobPart(decryptBlob(conversationKey, raw));

        // The ciphertext cache (see attachmentCache.ts) serves repeat views
        // from disk - no network round trip, no download rate limit. A
        // cached copy that no longer decrypts (truncated write, changed
        // key) must not brick the attachment: drop the row and refetch.
        let raw = await getCachedAttachment(attachment.id, attachment.sizeBytes);
        let plaintext: Uint8Array<ArrayBuffer> | null = null;
        if (raw) {
          try {
            plaintext = decrypt(raw);
          } catch {
            await deleteCachedAttachments([attachment.id]);
            raw = null;
          }
        }
        if (!raw) raw = await fetchRaw();
        if (!plaintext) {
          try {
            plaintext = decrypt(raw);
          } catch {
            throw new Error("This attachment's stored data is damaged and could not be decrypted.");
          }
        }
        const mimetype = resolveFileMimetype(meta.mimetype, meta.filename);
        const blob = new Blob([plaintext], { type: mimetype });
        const url = URL.createObjectURL(blob);
        setState({ kind: "loaded", url, mimetype, bytes: plaintext });
        if (openDocumentAfterLoad) setDocumentOpen(true);
        if (downloadAfterLoad) {
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = meta.filename;
          anchor.click();
        }
      } catch (error) {
        setState({ kind: "error" });
        showToast({
          title: "Attachment could not be opened",
          message: error instanceof Error ? error.message : "Check your connection and try again.",
        });
      }
    },
    [attachment.id, attachment.sizeBytes, conversationKey, downloadUrl, meta, showToast],
  );

  useEffect(() => {
    if (meta && kind !== "binary" && !isTextDocument && state.kind === "idle") void load();
  }, [kind, isTextDocument, load, meta, state.kind]);

  const loadedUrl = state.kind === "loaded" ? state.url : null;
  useEffect(
    () => () => {
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    },
    [loadedUrl],
  );

  if (!meta) return null;

  function showVideoError() {
    showToast({
      title: "Video could not be played",
      message: "This browser may not support the video's codec. You can still download the original file.",
    });
  }

  if (state.kind === "loaded") {
    if (kind === "image") {
      return (
        <>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Expand ${meta.filename}`}
            className="group relative block max-w-full"
          >
            <img
              src={state.url}
              alt={meta.filename}
              className={clsx(
                "max-w-full object-contain",
                standalone ? "max-h-80 rounded-2xl" : "max-h-64 rounded-lg",
              )}
            />
            <span className="absolute right-1.5 bottom-1.5 rounded-md bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
              <ZoomIn size={14} aria-hidden />
            </span>
          </button>
          {/* Portaled to document.body: inside the bubble, the bubble's own
              pressed-state transform (and any ancestor) would move/contain
              a position:fixed viewer, breaking its close button mid-press. */}
          {lightboxOpen &&
            createPortal(
              <ImageLightbox url={state.url} filename={meta.filename} onClose={() => setLightboxOpen(false)} />,
              document.body,
            )}
        </>
      );
    }

    if (kind === "video") {
      return (
        <div className="min-w-0 max-w-full overflow-hidden">
          <VideoPreviewTile
            url={state.url}
            filename={meta.filename}
            className="aspect-video w-[32rem] min-w-0 max-w-full rounded-lg"
            onOpen={() => setLightboxOpen(true)}
            onError={showVideoError}
          />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
          {lightboxOpen &&
            createPortal(
              <VideoLightbox
                url={state.url}
                filename={meta.filename}
                onClose={() => setLightboxOpen(false)}
                onError={showVideoError}
              />,
              document.body,
            )}
        </div>
      );
    }

    if (kind === "audio") {
      return (
        <div>
          <ThemedAudioPlayer url={state.url} filename={meta.filename} />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
        </div>
      );
    }

    if (kind === "pdf") {
      return (
        <div>
          <button
            type="button"
            onClick={() => (touchUi ? void load(true) : setDocumentOpen(true))}
            className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-left text-[var(--text)] hover:ring-1 hover:ring-inset hover:ring-[var(--border-strong)]"
          >
            <FileText size={28} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{meta.filename}</span>
              <span className="block text-xs text-[var(--text-muted)]">
                {touchUi ? "PDF document · Tap to download" : "PDF document · Open full preview"}
              </span>
            </span>
            {touchUi ? <Download size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
          </button>
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
          {documentOpen &&
            createPortal(
              <DocumentLightbox filename={meta.filename} url={state.url} pdf onClose={() => setDocumentOpen(false)} />,
              document.body,
            )}
        </div>
      );
    }

    if (isTextDocument) {
      return (
        <div className="min-w-0 max-w-full overflow-hidden">
          <CompactFileCard
            mimetype={state.mimetype}
            filename={meta.filename}
            size={meta.size}
            // Touch/small screens skip the viewer entirely for documents:
            // the tap downloads the decrypted file straight away.
            action={touchUi ? "Download" : "Preview"}
            onClick={() => (touchUi ? void load(true) : setDocumentOpen(true))}
          />
          <PreviewFooter filename={meta.filename} size={meta.size} url={state.url} />
          {documentOpen &&
            createPortal(
              <DocumentLightbox filename={meta.filename} url={state.url} onClose={() => setDocumentOpen(false)}>
                <DocumentPreviewContent
                  kind={kind}
                  bytes={state.bytes}
                  mimetype={state.mimetype}
                  filename={meta.filename}
                  fullScreen
                />
              </DocumentLightbox>,
              document.body,
            )}
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
        <span className="min-w-0 flex-1 truncate">{meta.filename}</span>
        <Download size={14} aria-hidden />
      </a>
    );
  }

  if (state.kind === "loading" && isTextDocument) {
    return (
      <CompactFileCard
        mimetype={meta.mimetype}
        filename={meta.filename}
        size={meta.size}
        action={`${Math.round(state.progress * 100)}%`}
        onClick={() => undefined}
        disabled
      />
    );
  }

  if (state.kind === "loading" && kind !== "binary") {
    const percent = Math.round(state.progress * 100);
    return (
      <div className="relative min-h-28 min-w-48 overflow-hidden rounded-lg border border-current/15 bg-[var(--surface-muted)] text-[var(--text)]">
        <div className="flex h-28 items-center justify-center opacity-50 blur-[1px]">
          <IconForMime mimetype={meta.mimetype} filename={meta.filename} size={34} />
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-[var(--surface-raised)]/95 p-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">Downloading {meta.filename}</span>
            <span className="shrink-0 tabular-nums">{percent}%</span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"
            role="progressbar"
            aria-label={`Downloading ${meta.filename}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full bg-[var(--color-accent-500)] transition-[width] duration-150"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <CompactFileCard
      mimetype={meta.mimetype}
      filename={meta.filename}
      size={meta.size}
      // Binary files always download; documents download on touch/small
      // screens (no viewer there) and preview on desktop.
      action={state.kind === "error" ? "Retry" : kind === "binary" || touchUi ? "Download" : "Preview"}
      onClick={() => void load(kind === "binary" || touchUi, isTextDocument && !touchUi)}
      disabled={state.kind === "loading"}
    />
  );
}
