import { Play } from "lucide-react";
import clsx from "clsx";

interface Props {
  url: string;
  filename: string;
  className?: string;
  thumbnailClassName?: string;
  onOpen: () => void;
  onError?: () => void;
}

/** Theme-aware, non-playing video thumbnail shared by profile galleries and
 * chat attachments. Actual playback belongs to the full-screen viewer. */
export function VideoPreviewTile({ url, filename, className, thumbnailClassName, onOpen, onError }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open video ${filename} in full screen`}
      className={clsx(
        "group relative block overflow-hidden bg-black text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-500)]",
        className,
      )}
    >
      <video
        src={`${url}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        draggable={false}
        onError={onError}
        className={clsx("pointer-events-none h-full w-full object-cover", thumbnailClassName)}
      />
      <span
        className="pointer-events-none absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/20"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[var(--btn-bg)] text-[var(--btn-fg)] shadow-lg transition-transform group-hover:scale-105 group-hover:bg-[var(--btn-bg-hover)]"
        aria-hidden
      >
        <Play size={21} fill="currentColor" />
      </span>
    </button>
  );
}
