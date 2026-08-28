import { useEffect, useRef } from "react";

/**
 * Keeps a full-viewport chat shell in sync with the on-screen keyboard.
 * Two mechanisms work together:
 *
 * 1. `--vvh` tracks visualViewport.height so the shell (`.vvh-shell`)
 *    shrinks to the space above the keyboard. `dvh` covers Android and
 *    desktop; iOS Safari's layout viewport never resizes for the
 *    keyboard, so this is the only height source that follows it there.
 * 2. iOS pans the whole page upward when it focuses the composer - the
 *    pan happens *before* the viewport-resize event fires, and without a
 *    reset the app stays shifted up (header off-screen, thread "jumped")
 *    even after the shell has resized. The app fills exactly the visual
 *    viewport and never needs a page scroll, so scrolling the window back
 *    to 0 on every viewport move pins the header in place.
 *
 * `onResize` runs after the browser has reflowed the shrunken shell (the
 * resize event fires first), which is when a pinned thread can safely
 * re-apply its bottom scroll position.
 *
 * A pinch-zoom - trackpad on desktop Chrome, or a real pinch gesture on
 * mobile - fires these same visualViewport events (its `scale` moves away
 * from 1, since the visual viewport shrinks in CSS px while the layout
 * viewport doesn't). Reacting to that the same way as a keyboard resize
 * made the shell height chase every intermediate frame of the zoom
 * gesture, and the scroll-reset fought the browser's own zoom/pan - the
 * composer visibly "followed" the zoom instead of staying put. Skipping
 * this handler while zoomed leaves `.vvh-shell` on its `100dvh` CSS
 * fallback, which already tracks a genuine viewport-size change (window
 * resize, orientation change) with no JS help and isn't sensitive to
 * pinch-zoom the way visualViewport.height is.
 */
export function useKeyboardViewport(onResize?: () => void): void {
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const zoomed = Math.abs(viewport.scale - 1) > 0.01;
      if (zoomed) {
        document.documentElement.style.removeProperty("--vvh");
        return;
      }
      document.documentElement.style.setProperty("--vvh", `${viewport.height}px`);
      requestAnimationFrame(() => {
        if (window.scrollY > 0) window.scrollTo(0, 0);
        onResizeRef.current?.();
      });
    };

    viewport.addEventListener("resize", update);
    // `scroll` fires repeatedly while iOS animates the keyboard pan (and
    // while a pinch-zoom gesture is in progress) - resetting every frame
    // keeps the header pinned through the transition instead of snapping
    // only after it ends.
    viewport.addEventListener("scroll", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--vvh");
    };
  }, []);
}
