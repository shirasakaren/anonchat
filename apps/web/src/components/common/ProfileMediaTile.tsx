import { Play } from "lucide-react";
import type { ProfileMediaDto } from "@anonchat/shared";
import clsx from "clsx";

interface Props {
  media: ProfileMediaDto;
  alt: string;
  className?: string;
  onImageOpen?: (media: ProfileMediaDto) => void;
  onVideoOpen?: (media: ProfileMediaDto) => void;
}

/** Shared profile renderer. Animated GIFs play naturally through <img>.
 * Videos stay inert in the grid and open in the full-screen player. */
export function ProfileMediaTile({ media, alt, className, onImageOpen, onVideoOpen }: Props) {
  if (media.kind === "image") {
    return (
      <button
        type="button"
        onClick={() => onImageOpen?.(media)}
        aria-label={`Open ${media.filename}`}
        className={clsx(
          "block overflow-hidden bg-[var(--surface-muted)] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-500)]",
          className,
        )}
      >
        <img src={media.url} alt={alt} className="h-full w-full object-cover" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onVideoOpen?.(media)}
      aria-label={`Open video ${media.filename}`}
      className={clsx(
        "group relative block overflow-hidden bg-black text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-500)]",
        className,
      )}
    >
      <video
        src={`${media.url}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none h-full w-full object-cover"
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
      <span className="sr-only">{alt}</span>
    </button>
  );
}
