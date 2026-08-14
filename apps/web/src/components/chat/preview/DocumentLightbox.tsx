import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

interface Props {
  filename: string;
  url: string;
  onClose: () => void;
  children?: ReactNode;
  pdf?: boolean;
}

/** Full-screen local attachment viewer. PDF files retain the browser's own
 *  page, search, print, and zoom toolbar; converted/text documents use the
 *  themed toolbar here and stay inside one independently scrollable pane. */
export function DocumentLightbox({ filename, url, onClose, children, pdf = false }: Props) {
  const [zoom, setZoom] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  function changeZoom(next: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-5"
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${filename}`}
        className="flex h-full w-full min-w-0 max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-3">
          <p className="min-w-0 truncate text-sm font-semibold">{filename}</p>
          <div className="flex shrink-0 items-center gap-1">
            {!pdf && (
              <>
                <button
                  type="button"
                  onClick={() => changeZoom(zoom - ZOOM_STEP)}
                  disabled={zoom <= MIN_ZOOM}
                  aria-label="Zoom out"
                  className="rounded-lg p-2 hover:bg-[var(--surface-muted)] disabled:opacity-30"
                >
                  <ZoomOut size={18} aria-hidden />
                </button>
                <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => changeZoom(zoom + ZOOM_STEP)}
                  disabled={zoom >= MAX_ZOOM}
                  aria-label="Zoom in"
                  className="rounded-lg p-2 hover:bg-[var(--surface-muted)] disabled:opacity-30"
                >
                  <ZoomIn size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
                  }}
                  aria-label="Reset zoom and return to top"
                  className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"
                >
                  <RotateCcw size={18} aria-hidden />
                </button>
              </>
            )}
            <a
              href={url}
              download={filename}
              aria-label={`Download ${filename}`}
              className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"
            >
              <Download size={18} aria-hidden />
            </a>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>

        {pdf ? (
          <iframe title={filename} src={url} className="min-h-0 flex-1 bg-white" />
        ) : (
          <div
            ref={scrollRef}
            className="min-h-0 min-w-0 max-w-full flex-1 overflow-auto bg-[var(--surface)] p-3 sm:p-6"
          >
            <div className="mx-auto w-full min-w-0 max-w-5xl overflow-hidden" style={{ zoom }}>
              {children}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
