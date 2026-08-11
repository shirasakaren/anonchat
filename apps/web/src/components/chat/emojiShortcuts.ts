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

/** Expands Discord/Slack-style :shortcode: text into the actual emoji. */
export function expandEmojiShortcuts(text: string): string {
  return text.replace(SHORTCODE_PATTERN, (match, code: string) => SHORTCODES[code.toLowerCase()] ?? match);
}
