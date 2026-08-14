/**
 * Pixel offset of the caret within a <textarea>, relative to the textarea's
 * own top-left corner (already accounts for internal scroll). There's no
 * native DOM API for this - the standard workaround (used by every
 * "@mention popup" implementation) is a hidden mirror <div> that copies
 * every text-layout-affecting style property from the textarea, filled
 * with the same text up to the caret, so the browser lays it out
 * identically and a marker <span> at that position can be measured.
 */

const MIRROR_STYLE_PROPS = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "textTransform",
  "textIndent",
  "textAlign",
  "lineHeight",
  "wordSpacing",
] as const satisfies readonly (keyof CSSStyleDeclaration)[];

export interface CaretRect {
  /** Offset from the textarea's own top edge, in px. */
  top: number;
  /** Offset from the textarea's own left edge, in px. */
  left: number;
  /** The line's height, so a caller can position something above/below it. */
  height: number;
}

export function getCaretCoordinates(el: HTMLTextAreaElement, index: number): CaretRect {
  const mirror = document.createElement("div");
  const computed = window.getComputedStyle(el);

  const style = mirror.style;
  style.position = "absolute";
  style.visibility = "hidden";
  style.top = "0";
  style.left = "-9999px";
  // The textarea's own wrapping behavior, not the mirror's default (a
  // plain block div wraps at word boundaries by default, which already
  // matches, but this pins it explicitly rather than relying on that).
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.overflow = "hidden";

  for (const prop of MIRROR_STYLE_PROPS) {
    const value = computed[prop];
    if (typeof value === "string") style.setProperty(cssPropertyName(prop), value);
  }

  document.body.appendChild(mirror);
  // A textarea collapses a trailing newline's rendered height, but the
  // mirror (a div) doesn't automatically - text ending exactly at a
  // newline needs this to match the textarea's own line-breaking.
  mirror.textContent = el.value.slice(0, index).replace(/\n$/, "\n​");

  const marker = document.createElement("span");
  // A zero-width marker would sit at the very edge of the wrapped line and
  // some browsers report an unreliable offset there - a single character
  // gives it real geometry to measure.
  marker.textContent = el.value.slice(index) || ".";
  mirror.appendChild(marker);

  const top = marker.offsetTop - el.scrollTop;
  const left = marker.offsetLeft - el.scrollLeft;
  const height = marker.offsetHeight || parseFloat(computed.lineHeight) || 16;

  document.body.removeChild(mirror);
  return { top, left, height };
}

/** camelCase -> kebab-case, since CSSStyleDeclaration's computed values are
 *  read via camelCase properties but setProperty() wants the CSS form. */
function cssPropertyName(prop: string): string {
  return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
