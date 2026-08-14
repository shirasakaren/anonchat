import type { CannedReplyDto } from "@anonchat/shared";

/**
 * Only triggers when "/partial" is the very first thing typed in the
 * composer (Slack/Discord's own slash-command convention) - deliberately
 * NOT after whitespace elsewhere in the message the way the emoji
 * :shortcode: trigger is (see emojiShortcuts.ts's findActiveShortcodeQuery).
 * "/" is common inside URLs and paths ("see docs at example.com/path");
 * firing a popup there would be noise, and there'd be no way to type a
 * literal "/" later in a message without one appearing.
 */
export function findActiveSlashQuery(textBeforeCursor: string): { query: string } | null {
  const match = /^\/(\S*)$/.exec(textBeforeCursor);
  if (!match) return null;
  return { query: match[1]!.toLowerCase() };
}

/** Templates whose title starts with `query` (case-insensitive) - a bare
 *  "/" (empty query) lists everything: unlike the emoji dataset's ~1900
 *  entries, an admin's own template list is short enough to browse in
 *  full. Sorted shortest-title-first (closer match to what was typed),
 *  then alphabetically. */
export function searchCannedReplies(replies: CannedReplyDto[], query: string, limit = 8): CannedReplyDto[] {
  const matches = query ? replies.filter((r) => r.title.toLowerCase().startsWith(query)) : replies;
  return [...matches].sort((a, b) => a.title.length - b.title.length || a.title.localeCompare(b.title)).slice(0, limit);
}
