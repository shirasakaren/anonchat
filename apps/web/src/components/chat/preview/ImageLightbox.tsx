import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import { LightboxActionsMenu, type ViewerActions } from "./LightboxActionsMenu.js";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;
/** Click-to-zoom toggles to this level (Twitter/X, Google Photos convention)
 *  - the toolbar +/- buttons and wheel still offer finer continuous control
 *  up to MAX_ZOOM for anyone who wants more than the click default. */
const CLICK_ZOOM_LEVEL = 2;
/** Pointer movement below this (px) between mousedown and mouseup still
 *  counts as a click, not a pan-drag - without this, releasing a genuine
 *  drag would also fire a click and immediately undo the zoom/pan. */
const DRAG_THRESHOLD_PX = 4;

interface Props {
  url: string;
  filename: string;
  onClose: () => void;
  /** Reply/react/edit/delete for the message, shown under the header's ⋯.
   *  When absent (e.g. the message was deleted) the ⋯ is hidden. */
  actions?: ViewerActions;
}

/**
 * Full-screen click-to-expand viewer. Clicking anywhere outside the image
 * itself (the backdrop, the empty space around it) closes the viewer -
 * clicking the image toggles zoom instead, matching the native
 * `cursor: zoom-in`/`zoom-out` affordance shown while hovering it. Wheel/
 * toolbar buttons still zoom continuously; drag-to-pan still works once
 * zoomed in. Pan resets whenever zoom returns to 1x, since there's nothing
 * to pan around at the image's natural size.
 */
export function ImageLightbox({ url, filename, onClose, actions }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number; dragged: boolean } | null>(
    null,
  );

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
    // Stops here, not just at the container level - clicking the image
    // itself must never close the viewer, only the space around it should.
    e.stopPropagation();
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, dragged: false };
  }

  function handlePointerMove(e: ReactMouseEvent<HTMLImageElement>) {
    if (!dragState.current) return;
    const { startX, startY, panX, panY } = dragState.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) dragState.current.dragged = true;
    if (zoom > MIN_ZOOM) setPan({ x: panX + dx, y: panY + dy });
  }

  function handlePointerUp() {
    const wasClick = !dragState.current?.dragged;
    dragState.current = null;
    if (wasClick) applyZoom(zoom > MIN_ZOOM ? MIN_ZOOM : CLICK_ZOOM_LEVEL);
  }

  function cancelDrag() {
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
          {actions && <LightboxActionsMenu actions={actions} onCloseViewer={onClose} />}
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

      {/* No onMouseDown/stopPropagation here (unlike the header above) -
          this is deliberately the "off area" the backdrop's onClose should
          still catch. Only the <img> itself stops propagation, so clicking
          the empty space around the image closes the viewer while clicking
          the image toggles zoom instead. */}
      <div className="flex flex-1 items-center justify-center overflow-hidden" onWheel={handleWheel}>
        <img
          src={url}
          alt={filename}
          draggable={false}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={cancelDrag}
          className="max-h-full max-w-full select-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: dragState.current ? "none" : "transform 100ms ease-out",
            cursor: zoom > MIN_ZOOM ? "zoom-out" : "zoom-in",
          }}
        />
      </div>
    </div>
  );
}
