const SHORTCODES: Record<string, string> = {
  smile: "😄",
  smiley: "😃",
  grin: "😁",
  joy: "😂",
  rofl: "🤣",
  sob: "😭",
  cry: "😢",
  heart: "❤️",
  broken_heart: "💔",
  thumbsup: "👍",
  "+1": "👍",
  thumbsdown: "👎",
  "-1": "👎",
  fire: "🔥",
  eyes: "👀",
  thinking: "🤔",
  wave: "👋",
  clap: "👏",
  pray: "🙏",
  tada: "🎉",
  100: "💯",
  wink: "😉",
  blush: "😊",
  angry: "😠",
  scream: "😱",
  sunglasses: "😎",
  skull: "💀",
  check: "✅",
  x: "❌",
};

const SHORTCODE_PATTERN = /:([a-z0-9_+-]+):/gi;
const CODE_CHARS = "[a-z0-9_+-]";

/** Expands Discord/Slack-style :shortcode: text into the actual emoji. */
export function expandEmojiShortcuts(text: string): string {
  return text.replace(SHORTCODE_PATTERN, (match, code: string) => SHORTCODES[code.toLowerCase()] ?? match);
}

export interface ShortcodeMatch {
  code: string;
  emoji: string;
}

/** Every known shortcode, for building an autocomplete list. */
export function listShortcodes(): ShortcodeMatch[] {
  return Object.entries(SHORTCODES).map(([code, emoji]) => ({ code, emoji }));
}

/** Shortcodes whose name starts with `query` (case-insensitive), for a live
 *  ":partial" autocomplete preview. Empty query matches nothing - typing a
 *  bare ":" shouldn't immediately pop a list of every emoji in existence. */
export function searchShortcodes(query: string, limit = 8): ShortcodeMatch[] {
  if (!query) return [];
  const q = query.toLowerCase();
  return listShortcodes()
    .filter(({ code }) => code.startsWith(q))
    .sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code))
    .slice(0, limit);
}

/** If the text up to `cursor` ends in an in-progress ":partial" shortcode
 *  (preceded by start-of-string or whitespace, so URLs/times like "10:30"
 *  don't trigger it), returns where it starts and the partial code typed
 *  so far. Used to drive the inline autocomplete dropdown. */
export function findActiveShortcodeQuery(textBeforeCursor: string): { start: number; query: string } | null {
  const match = new RegExp(`(?:^|\\s)(:(${CODE_CHARS}*))$`, "i").exec(textBeforeCursor);
  const full = match?.[1];
  const query = match?.[2] ?? "";
  if (full === undefined) return null;
  return { start: textBeforeCursor.length - full.length, query: query.toLowerCase() };
}

/** If the text up to `cursor` ends in a just-completed ":code:" for a known
 *  shortcode, returns the span to replace and its emoji - lets the composer
 *  convert a shortcode to the real emoji the instant its closing ":" is
 *  typed, instead of only at send time. */
export function matchCompletedShortcode(
  textBeforeCursor: string,
): { start: number; end: number; emoji: string } | null {
  const match = new RegExp(`:(${CODE_CHARS}+):$`, "i").exec(textBeforeCursor);
  const full = match?.[0];
  const code = match?.[1];
  if (full === undefined || code === undefined) return null;
  const emoji = SHORTCODES[code.toLowerCase()];
  if (!emoji) return null;
  return { start: textBeforeCursor.length - full.length, end: textBeforeCursor.length, emoji };
}
