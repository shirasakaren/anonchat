import { File, Music, Video } from "lucide-react";
import { resolveFileMimetype } from "./preview/textFileTypes.js";
import type { PendingAttachmentPreview } from "./types.js";

export function createPendingAttachmentPreviews(files: File[]): PendingAttachmentPreview[] {
  return files.map((file) => {
    const mimetype = resolveFileMimetype(file.type, file.name);
    return {
      filename: file.name,
      mimetype,
      size: file.size,
      previewUrl: /^(image|video)\//.test(mimetype) ? URL.createObjectURL(file) : null,
    };
  });
}

export function revokePendingAttachmentPreviews(previews: PendingAttachmentPreview[]): void {
  for (const preview of previews) if (preview.previewUrl) URL.revokeObjectURL(preview.previewUrl);
}

export function PendingAttachmentTransfer({
  attachments,
  progress = 0,
}: {
  attachments: PendingAttachmentPreview[];
  progress?: number;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div className="mb-2 space-y-2">
      {attachments.map((attachment, index) => (
        <div
          key={`${attachment.filename}-${index}`}
          className="relative min-h-28 min-w-48 overflow-hidden rounded-lg border border-current/15 bg-[var(--surface-muted)] text-[var(--text)]"
        >
          {attachment.previewUrl && attachment.mimetype.startsWith("image/") ? (
            <img src={attachment.previewUrl} alt="" className="h-36 w-full scale-105 object-cover opacity-60 blur-md" />
          ) : attachment.previewUrl && attachment.mimetype.startsWith("video/") ? (
            <video
              src={attachment.previewUrl}
              muted
              preload="metadata"
              className="h-36 w-full scale-105 object-cover opacity-60 blur-md"
            />
          ) : (
            <div className="flex h-28 items-center justify-center">
              {attachment.mimetype.startsWith("audio/") ? (
                <Music size={32} aria-hidden />
              ) : attachment.mimetype.startsWith("video/") ? (
                <Video size={32} aria-hidden />
              ) : (
                <File size={32} aria-hidden />
              )}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-[var(--surface-raised)]/95 p-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium">{attachment.filename}</span>
              <span className="shrink-0 tabular-nums">{percent}%</span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"
              role="progressbar"
              aria-label={`Uploading ${attachment.filename}`}
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
      ))}
    </div>
  );
}
