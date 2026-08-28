/**
 * A message that's nothing but a handful of emoji renders larger - like
 * WhatsApp/Telegram, so an emoji-only reaction-style message stays visible
 * at a glance, tapering back to normal text size once there are enough of
 * them that "big" stops being useful.
 */

// Extended_Pictographic covers standalone emoji and the pictographic base
// of ZWJ sequences (family/profession emoji, skin-tone modifiers);
// Regional_Indicator covers flags, which are a *pair* of indicator
// codepoints with no pictographic character of their own.
const EMOJI_PART_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Largest emoji count this still renders big for - beyond this a "message"
 *  is more likely a wall of pasted emoji than a quick reaction, and the
 *  existing markdown/expandable-prose pipeline (with its length clamp)
 *  handles that better than an unclamped block of oversized glyphs would. */
const MAX_BIG_EMOJI = 5;

const SIZE_CLASSES = ["text-6xl", "text-5xl", "text-4xl", "text-3xl", "text-2xl"];

/**
 * Counts the emoji in a message that consists of nothing but emoji (and
 * whitespace between them) - null for anything else, including empty text.
 * Segments by grapheme cluster, not raw code point, so a flag (two regional
 * indicators), a skin-tone-modified emoji, or a ZWJ family sequence each
 * count as the single emoji a person actually perceives, not several.
 */
function countEmojiOnly(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let count = 0;
  for (const { segment } of segmenter.segment(trimmed)) {
    if (/^\s+$/.test(segment)) continue;
    if (!EMOJI_PART_RE.test(segment)) return null;
    count++;
  }
  return count > 0 ? count : null;
}

export interface EmojiOnlyDisplay {
  count: number;
  sizeClass: string;
}

/** Returns the display info for a big-emoji message, or null when this
 *  message shouldn't render that way (mixed content, too many emoji, or
 *  not emoji at all) - callers fall back to the normal text pipeline. */
export function getEmojiOnlyDisplay(text: string): EmojiOnlyDisplay | null {
  const count = countEmojiOnly(text);
  if (count === null || count > MAX_BIG_EMOJI) return null;
  return { count, sizeClass: SIZE_CLASSES[count - 1]! };
}
