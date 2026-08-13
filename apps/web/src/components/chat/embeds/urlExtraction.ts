/** Shared with markdown.ts's `linkify()` - one regex for "what counts as a
 *  bare URL in a message", used consistently for both auto-linking and
 *  embed/link-preview detection so they can't silently disagree. */
export const BARE_URL_RE = /(^|[\s(])((https?:\/\/)[^\s<)]+)/g;

/** Extracts up to `maxCount` distinct URLs from raw message text, in the
 *  order they appear - callers use this to decide which links (if any) get
 *  a video embed or a link-preview card underneath the message. */
export function extractUrls(text: string, maxCount: number): string[] {
  const urls: string[] = [];
  const re = new RegExp(BARE_URL_RE.source, "g");
  let match: RegExpExecArray | null;
  while (urls.length < maxCount && (match = re.exec(text))) {
    const url = match[2];
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}
