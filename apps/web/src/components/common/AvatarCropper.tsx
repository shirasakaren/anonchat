import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

const VIEWPORT = 288;
const OUTPUT_SIZE = 480;
const MAX_ZOOM = 3;
const OUTPUT_QUALITY = 0.9;

interface AvatarCropperProps {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

/** Clamp a pan offset so the image can never reveal empty space in the viewport. */
function clampOffset(offset: number, displayedSize: number): number {
  const max = Math.max(0, (displayedSize - VIEWPORT) / 2);
  return Math.min(max, Math.max(-max, offset));
}

/**
 * A crop/zoom/pan modal for the selected avatar file, rendered before
 * upload. Output is always a fixed-size JPEG - deliberately re-encoding
 * (rather than passing the original bytes through untouched) is what lets
 * cropping/zooming happen at all, and keeps the result comfortably under
 * the server's 2MB avatar limit regardless of the source file's size.
 */
export function AvatarCropper({ file, onCancel, onCropped }: AvatarCropperProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Object URL creation and revocation live in the SAME effect (rather than
  // a useMemo + separate revoking effect) so React StrictMode's dev-only
  // double-invoke - mount, cleanup, mount again - creates a fresh URL on its
  // second pass instead of revoking the one useMemo already handed to the
  // <img>, which otherwise left it pointing at a dead blob: URL.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = natural ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h) : 1;
  const effectiveScale = baseScale * zoom;
  const displayedW = natural ? natural.w * effectiveScale : VIEWPORT;
  const displayedH = natural ? natural.h * effectiveScale : VIEWPORT;

  function handleImageLoad() {
    const el = imgRef.current;
    if (!el) return;
    setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    setOffset({ x: 0, y: 0 });
  }

  function handleZoomChange(next: number) {
    setZoom(next);
    const nextDisplayedW = natural ? natural.w * baseScale * next : VIEWPORT;
    const nextDisplayedH = natural ? natural.h * baseScale * next : VIEWPORT;
    setOffset((prev) => ({
      x: clampOffset(prev.x, nextDisplayedW),
      y: clampOffset(prev.y, nextDisplayedH),
    }));
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: clampOffset(drag.startOffset.x + (e.clientX - drag.startX), displayedW),
      y: clampOffset(drag.startOffset.y + (e.clientY - drag.startY), displayedH),
    });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  const handleConfirm = useCallback(() => {
    const el = imgRef.current;
    if (!el || !natural) return;
    const imageLeft = (VIEWPORT - displayedW) / 2 + offset.x;
    const imageTop = (VIEWPORT - displayedH) / 2 + offset.y;
    const sourceX = -imageLeft / effectiveScale;
    const sourceY = -imageTop / effectiveScale;
    const sourceSize = VIEWPORT / effectiveScale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(el, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob((blob) => blob && onCropped(blob), "image/jpeg", OUTPUT_QUALITY);
  }, [natural, displayedW, displayedH, offset, effectiveScale, onCropped]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-xl">
        <h2 className="mb-1 text-sm font-semibold">Adjust your avatar</h2>
        <p className="mb-4 text-xs text-[var(--text-muted)]">Drag to reposition, use the slider to zoom.</p>

        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-full border border-[var(--border)]"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: dragRef.current ? "grabbing" : "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {imgSrc && (
            <img
              ref={imgRef}
              src={imgSrc}
              alt=""
              draggable={false}
              onLoad={handleImageLoad}
              className="absolute"
              style={{
                width: displayedW,
                height: displayedH,
                left: (VIEWPORT - displayedW) / 2 + offset.x,
                top: (VIEWPORT - displayedH) / 2 + offset.y,
              }}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <ZoomOut size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="w-full accent-[var(--color-accent-500)]"
            aria-label="Zoom"
          />
          <ZoomIn size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!natural}
            className="flex-1 rounded-lg bg-[var(--btn-bg)] px-4 py-2 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
