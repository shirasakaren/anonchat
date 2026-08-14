import type { ProfileMediaDto } from "@anonchat/shared";
import clsx from "clsx";
import { VideoPreviewTile } from "./VideoPreviewTile.js";

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
    <VideoPreviewTile
      url={media.url}
      filename={media.filename}
      className={className}
      onOpen={() => onVideoOpen?.(media)}
    />
  );
}
