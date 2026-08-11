import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

const BARE_URL = /(^|[\s(])((https?:\/\/)[^\s<)]+)/g;

function linkify(raw: string): string {
  return raw.replace(BARE_URL, (match, lead: string, url: string) => `${lead}[${url}](${url})`);
}

/** Discord-like markdown subset, sanitized. Treats all content as untrusted, regardless of E2EE. */
export function renderMessageMarkdown(raw: string): string {
  const html = marked.parse(linkify(raw), { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "del", "code", "pre", "blockquote", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}

export function sanitizeLinkAttributes(container: HTMLElement): void {
  container.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer nofollow");
  });
}
