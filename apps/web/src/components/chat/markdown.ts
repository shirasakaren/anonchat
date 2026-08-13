import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

const BARE_URL = /(^|[\s(])((https?:\/\/)[^\s<)]+)/g;

function linkify(raw: string): string {
  return raw.replace(BARE_URL, (match, lead: string, url: string) => `${lead}[${url}](${url})`);
}

// `class` is allowed below so syntax-highlighted code blocks (hljs-* spans,
// language-* on the wrapping <code>) render with color - but `class` is
// user-reachable on ANY element via literal HTML typed directly into a
// message (marked passes inline HTML through as-is; DOMPurify is what
// actually decides what survives), not just on highlighter-generated
// markup. Without this hook, an attacker could type
// `<span class="fixed inset-0 z-50 bg-black">` and abuse this app's own
// Tailwind utility classes for a fake fullscreen overlay - a real risk in
// any app that allows `class` through a sanitizer. Filtering to only the
// token shapes this app itself ever generates closes that off without
// losing real highlighting.
const ALLOWED_CLASS_TOKEN = /^(hljs(-[\w.]+)*|language-[\w+#.-]*)$/i;

DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (data.attrName !== "class") return;
  data.attrValue = data.attrValue
    .split(/\s+/)
    .filter((token) => ALLOWED_CLASS_TOKEN.test(token))
    .join(" ");
});

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "del", "code", "pre", "blockquote", "ul", "ol", "li", "a", "span", "h1", "h2", "h3"],
  ALLOWED_ATTR: ["href", "target", "rel", "class"],
};

/** Discord-like markdown subset, sanitized. Treats all content as untrusted, regardless of E2EE. */
export function renderMessageMarkdown(raw: string): string {
  const html = marked.parse(linkify(raw), { async: false }) as string;
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

export function sanitizeLinkAttributes(container: HTMLElement): void {
  container.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer nofollow");
  });
}
