import { EMOJI_LIST } from "./emoji/emojiData.js";

/** slug -> emoji, straight from the dataset - every one of the ~1900 emoji
 *  gets a working :shortcode: this way, not just the hand-picked short
 *  aliases below. */
const SLUG_SHORTCODES: Record<string, string> = {};
for (const entry of EMOJI_LIST) SLUG_SHORTCODES[entry.slug] = entry.emoji;

/** Short, commonly-typed Slack/Discord-style aliases for the emoji people
 *  reach for most, layered on top of (and overriding) the dataset's own
 *  longer slug - e.g. "joy" instead of "face_with_tears_of_joy". Points at
 *  a canonical slug rather than a hand-typed emoji literal so there's no
 *  hand-transcribed unicode character in this file to get subtly wrong;
 *  resolved against SLUG_SHORTCODES below.
 *
 *  A couple of these (+1/-1/100) aren't valid slugs themselves - they're
 *  resolved the same way, just keyed by the numeral/symbol people actually
 *  type instead of a word. */
const CURATED_ALIASES: Record<string, string> = {
  smile: "grinning_face_with_smiling_eyes",
  smiley: "grinning_face_with_big_eyes",
  grin: "beaming_face_with_smiling_eyes",
  joy: "face_with_tears_of_joy",
  rofl: "rolling_on_the_floor_laughing",
  lol: "rolling_on_the_floor_laughing",
  laughing: "grinning_squinting_face",
  sob: "loudly_crying_face",
  cry: "crying_face",
  sad: "crying_face",
  heart: "red_heart",
  love: "red_heart",
  broken_heart: "broken_heart",
  heart_eyes: "smiling_face_with_heart_eyes",
  kissing_heart: "face_blowing_a_kiss",
  "+1": "thumbs_up",
  thumbsup: "thumbs_up",
  "-1": "thumbs_down",
  thumbsdown: "thumbs_down",
  fire: "fire",
  eyes: "eyes",
  thinking: "thinking_face",
  wave: "waving_hand",
  clap: "clapping_hands",
  pray: "folded_hands",
  tada: "party_popper",
  100: "hundred_points",
  wink: "winking_face",
  blush: "smiling_face_with_smiling_eyes",
  angry: "angry_face",
  rage: "enraged_face",
  scream: "face_screaming_in_fear",
  sunglasses: "smiling_face_with_sunglasses",
  cool: "smiling_face_with_sunglasses",
  skull: "skull",
  check: "check_mark_button",
  heavy_check_mark: "check_mark",
  x: "cross_mark",
  confused: "confused_face",
  worried: "worried_face",
  disappointed: "disappointed_face",
  sleepy: "sleepy_face",
  sleeping: "sleeping_face",
  mask: "face_with_medical_mask",
  nauseated: "nauseated_face",
  exploding_head: "exploding_head",
  clown: "clown_face",
  poop: "pile_of_poo",
  hankey: "pile_of_poo",
  ghost: "ghost",
  alien: "alien",
  robot: "robot",
  jack_o_lantern: "jack_o_lantern",
  santa: "santa_claus",
  champagne: "bottle_with_popping_cork",
  beer: "beer_mug",
  pizza: "pizza",
  coffee: "hot_beverage",
  rocket: "rocket",
  star: "star",
  star2: "glowing_star",
  zap: "high_voltage",
  boom: "collision",
  muscle: "flexed_biceps",
  ok_hand: "ok_hand",
  v: "victory_hand",
  raised_hands: "raising_hands",
  handshake: "handshake",
  middle_finger: "middle_finger",
  moneybag: "money_bag",
  gem: "gem_stone",
  warning: "warning",
  no_entry: "no_entry",
  question: "red_question_mark",
  exclamation: "red_exclamation_mark",
  new: "new_button",
  sos: "sos_button",
};

const SHORTCODES: Record<string, string> = { ...SLUG_SHORTCODES };
for (const [alias, slug] of Object.entries(CURATED_ALIASES)) {
  const emoji = SLUG_SHORTCODES[slug];
  if (emoji) SHORTCODES[alias] = emoji;
}

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
 *  bare ":" shouldn't immediately pop a list of every emoji in existence.
 *  Sorted shortest-code-first (a closer match to what was typed) and,
 *  within a tie, alphabetically - stable regardless of the underlying
 *  dataset's own object key order. */
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
