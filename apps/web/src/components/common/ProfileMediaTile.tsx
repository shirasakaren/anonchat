import { useRef, useState } from "react";
import { Play } from "lucide-react";
import type { ProfileMediaDto } from "@anonchat/shared";
import clsx from "clsx";

interface Props {
  media: ProfileMediaDto;
  alt: string;
  className?: string;
  onImageOpen?: (media: ProfileMediaDto) => void;
}

/** Shared profile renderer. Animated GIFs play naturally through <img>;
 * videos never autoplay and require the explicit play action. */
export function ProfileMediaTile({ media, alt, className, onImageOpen }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

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
    <div className={clsx("relative overflow-hidden bg-black", className)}>
      <video
        ref={videoRef}
        src={media.url}
        controls
        playsInline
        preload="metadata"
        aria-label={alt}
        className="h-full w-full object-contain"
        onPlay={() => setVideoPlaying(true)}
        onPause={() => setVideoPlaying(false)}
        onEnded={() => setVideoPlaying(false)}
      />
      {!videoPlaying && (
        <button
          type="button"
          onClick={() => void videoRef.current?.play()}
          aria-label={`Play ${media.filename}`}
          className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Play size={21} fill="currentColor" aria-hidden />
        </button>
      )}
    </div>
  );
}
