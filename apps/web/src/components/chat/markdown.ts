import DOMPurify from "dompurify";
import { marked, type Tokens } from "marked";
import { ensureLanguagesRegistered } from "./codeLanguages.js";
import { BARE_URL_RE } from "./embeds/urlExtraction.js";

marked.setOptions({ breaks: true, gfm: true });

function linkify(raw: string): string {
  // Text that already contains a markdown link must be protected before the
  // bare-URL pass runs on it. Tiptap serializes an autolinked URL as
  // `[url](url)` (text === href), and linkifying that again produced
  // `[url]([url](url))` - marked then parsed the outer link's href as the
  // literal markdown source `[url](url)`, and clicking it navigated to a
  // mangled relative route like /admin/c/[url](url). Swap existing links
  // out for placeholders, linkify everything else, then restore them.
  const preserved: string[] = [];
  const withPlaceholders = raw.replace(/\[[^[\]]*\]\([^()\n]*\)/g, (match) => {
    preserved.push(match);
    return `\u0000ANONCHAT_LINK_${preserved.length - 1}\u0000`;
  });
  const linked = withPlaceholders.replace(
    new RegExp(BARE_URL_RE.source, "g"),
    (match, lead: string, url: string) => `${lead}[${url}](${url})`,
  );
  return linked.replace(/\u0000ANONCHAT_LINK_(\d+)\u0000/g, (_, index: string) => preserved[Number(index)]!);
}

const renderer = new marked.Renderer();

// Common shorthand aliases for the curated language set. highlight.js'
// language ids are the canonical ones registered in codeLanguages.ts; the
// aliases people actually type in fenced blocks (```js, ```ts, …) resolve
// to those so syntax highlighting isn't silently skipped.
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  py: "python",
  rb: "ruby",
  golang: "go",
  html: "xml",
  htm: "xml",
  yml: "yaml",
  kt: "kotlin",
  rs: "rust",
  cs: "csharp",
};

// Overrides marked's default `code` rendering to run the fenced block's
// content through highlight.js first. highlight.js escapes the source
// itself before wrapping it in `hljs-*` spans, so `result.value` is already
// safe HTML - it still goes through the same DOMPurify pass as everything
// else below as defense in depth (see the class-token allowlist above it).
renderer.code = ({ text, lang }: Tokens.Code): string => {
  const hljs = ensureLanguagesRegistered();
  const code = text.replace(/\n$/, "");
  const requested = (lang || "").trim().split(/\s+/)[0]?.toLowerCase();
  const canonical = requested ? (LANGUAGE_ALIASES[requested] ?? requested) : undefined;
  const known = canonical && hljs.getLanguage(canonical) ? canonical : null;
  const highlighted = known ? hljs.highlight(code, { language: known, ignoreIllegals: true }).value : escapeHtml(code);
  const id = known ?? "plaintext";
  // The human-readable label (languageLabel) is looked up client-side from
  // this class in the post-render pass that adds the copy button - no need
  // to carry it as an attribute through the sanitizer too.
  return `<pre><code class="hljs language-${id}">${highlighted}</code></pre>`;
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

marked.use({ renderer });

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
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "em",
    "del",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "span",
    "h1",
    "h2",
    "h3",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class"],
};

/** Discord-like markdown subset, sanitized. Treats all content as untrusted, regardless of E2EE. */
export function renderMessageMarkdown(raw: string): string {
  const html = marked.parse(linkify(raw), { async: false });
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

export function sanitizeLinkAttributes(container: HTMLElement): void {
  container.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer nofollow");
  });
}
