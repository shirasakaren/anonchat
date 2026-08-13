/**
 * Maps a filename extension to one of codeLanguages.ts's registered
 * highlight.js language ids. Kept separate from mimetype sniffing because
 * browsers/OSes very commonly report generic types (`text/plain`,
 * `application/octet-stream`) for code files - the extension is the more
 * reliable signal for "what language is this", same reasoning as VS Code,
 * GitHub, etc.
 */
const EXTENSION_LANGUAGE: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  dockerfile: "dockerfile",
  md: "markdown",
  markdown: "markdown",
  xml: "xml",
  html: "xml",
  htm: "xml",
  svg: "xml",
  css: "css",
  ini: "ini",
  toml: "ini",
  cfg: "ini",
  conf: "ini",
  graphql: "graphql",
  gql: "graphql",
  kt: "kotlin",
  kts: "kotlin",
  lua: "lua",
  swift: "swift",
  txt: "plaintext",
  log: "plaintext",
  env: "ini",
};

const TEXT_LIKE_MIME_PREFIXES = ["text/"];
const TEXT_LIKE_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/javascript",
  "application/x-sh",
  "application/toml",
]);

function extensionOf(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1]!.toLowerCase() : null;
}

/** Returns the highlight.js language id to render a text/code attachment
 *  with, or null if this file shouldn't get the text/code preview at all
 *  (binary formats, or a generic mimetype/extension we don't recognize). */
export function detectTextLanguage(mimetype: string, filename: string): string | null {
  const ext = extensionOf(filename);
  const knownLanguage = ext ? EXTENSION_LANGUAGE[ext] : undefined;
  if (knownLanguage) return knownLanguage;

  const isTextLikeMime =
    TEXT_LIKE_MIME_PREFIXES.some((p) => mimetype.startsWith(p)) || TEXT_LIKE_MIME_EXACT.has(mimetype);
  if (isTextLikeMime && mimetype !== "text/csv") return "plaintext";

  return null;
}

export function isCsv(mimetype: string, filename: string): boolean {
  return mimetype === "text/csv" || extensionOf(filename) === "csv";
}

export const DOCX_MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
