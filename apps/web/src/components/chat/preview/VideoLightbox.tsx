import { useEffect, useRef } from "react";
import { Download, X } from "lucide-react";

interface Props {
  url: string;
  filename: string;
  onClose: () => void;
}

/** Full-screen video player. Playback only starts after the profile tile is
 * selected, and clicking the empty area around the player closes the view. */
export function VideoLightbox({ url, filename, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`View video ${filename}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onMouseDown={onClose}
    >
      <header className="flex items-center justify-between gap-2 p-3" onMouseDown={(event) => event.stopPropagation()}>
        <p className="min-w-0 truncate text-sm text-white/80">{filename}</p>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={url}
            download={filename}
            aria-label={`Download ${filename}`}
            className="rounded-lg p-2 text-white hover:bg-white/10"
          >
            <Download size={18} aria-hidden />
          </a>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close video"
            className="rounded-lg p-2 text-white hover:bg-white/10"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
        <video
          src={url}
          controls
          autoPlay
          playsInline
          preload="metadata"
          aria-label={filename}
          className="h-full w-full max-w-6xl bg-black object-contain shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        />
      </div>
    </div>
  );
}
