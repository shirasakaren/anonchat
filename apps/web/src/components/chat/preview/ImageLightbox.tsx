import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;

interface Props {
  url: string;
  filename: string;
  onClose: () => void;
}

/** Full-screen click-to-expand viewer: wheel/button zoom, drag-to-pan once
 *  zoomed in. Pan resets whenever zoom returns to 1x, since there's nothing
 *  to pan around at the image's natural size. */
export function ImageLightbox({ url, filename, onClose }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  function clampZoom(z: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  function applyZoom(next: number) {
    const clamped = clampZoom(next);
    setZoom(clamped);
    if (clamped === MIN_ZOOM) setPan({ x: 0, y: 0 });
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    applyZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }

  function handlePointerDown(e: ReactMouseEvent<HTMLImageElement>) {
    if (zoom <= MIN_ZOOM) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }

  function handlePointerMove(e: ReactMouseEvent<HTMLImageElement>) {
    if (!dragState.current) return;
    const { startX, startY, panX, panY } = dragState.current;
    setPan({ x: panX + (e.clientX - startX), y: panY + (e.clientY - startY) });
  }

  function stopDragging() {
    dragState.current = null;
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onMouseDown={onClose} role="presentation">
      <div className="flex items-center justify-between gap-2 p-3" onMouseDown={(e) => e.stopPropagation()}>
        <p className="truncate text-sm text-white/80">{filename}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => applyZoom(zoom - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="rounded-lg p-2 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ZoomOut size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => applyZoom(zoom + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="rounded-lg p-2 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ZoomIn size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => applyZoom(1)}
            disabled={zoom === MIN_ZOOM}
            aria-label="Reset zoom"
            className="rounded-lg p-2 text-white hover:bg-white/10 disabled:opacity-30"
          >
            <RotateCcw size={18} aria-hidden />
          </button>
          <a
            href={url}
            download={filename}
            aria-label={`Download ${filename}`}
            className="rounded-lg p-2 text-white hover:bg-white/10"
          >
            <Download size={18} aria-hidden />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-white hover:bg-white/10"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div
        className="flex flex-1 items-center justify-center overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={handleWheel}
      >
        <img
          src={url}
          alt={filename}
          draggable={false}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
          className="max-h-full max-w-full select-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: dragState.current ? "none" : "transform 100ms ease-out",
            cursor: zoom > MIN_ZOOM ? "grab" : "default",
          }}
        />
      </div>
    </div>
  );
}
