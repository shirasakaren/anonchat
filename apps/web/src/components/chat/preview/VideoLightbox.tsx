import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { LightboxActionsMenu, type ViewerActions } from "./LightboxActionsMenu.js";

interface Props {
  url: string;
  filename: string;
  onClose: () => void;
  onError?: () => void;
  /** Reply/react/edit/delete for the message, shown under the header's ⋯. */
  actions?: ViewerActions;
}

/** Full-screen video player. Playback only starts after the profile tile is
 * selected, and clicking the empty area around the player closes the view. */
export function VideoLightbox({ url, filename, onClose, onError, actions }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // While the ⋯ menu is open, the backdrop stays inert so an outside tap
  // closes only the menu, not the whole viewer.
  const [menuOpen, setMenuOpen] = useState(false);

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
      // Same portaling fix as the image viewer: clicks stay inside the
      // viewer instead of bubbling through the React tree to the message
      // bubble's tap-to-select.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={() => {
        if (menuOpen) return;
        onClose();
      }}
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
          {actions && (
            <LightboxActionsMenu actions={actions} onCloseViewer={onClose} onMenuOpenChange={setMenuOpen} />
          )}
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
          onError={onError}
        />
      </div>
    </div>
  );
}
