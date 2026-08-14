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
  jsonc: "json",
  mdx: "markdown",
  scss: "css",
  sass: "css",
  less: "css",
  vue: "xml",
  svelte: "xml",
  astro: "xml",
  fish: "bash",
  ps1: "powershell",
  bat: "dos",
  cmd: "dos",
  pl: "perl",
  pm: "perl",
  r: "r",
  scala: "scala",
  dart: "dart",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  fs: "fsharp",
  fsx: "fsharp",
  vb: "vbnet",
  asm: "x86asm",
  s: "x86asm",
  sol: "solidity",
  proto: "protobuf",
  tf: "hcl",
  hcl: "hcl",
  properties: "properties",
  gradle: "gradle",
  cmake: "cmake",
  makefile: "makefile",
  editorconfig: "ini",
  gitignore: "plaintext",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ...Object.fromEntries(Object.keys(EXTENSION_LANGUAGE).map((extension) => [extension, "text/plain"])),
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
};

const BINARY_EXTENSIONS = new Set([
  "exe",
  "bin",
  "dll",
  "so",
  "dylib",
  "class",
  "jar",
  "war",
  "zip",
  "7z",
  "rar",
  "gz",
  "bz2",
  "xz",
  "tar",
  "iso",
  "dmg",
  "pkg",
  "deb",
  "rpm",
  "apk",
  "ipa",
  "wasm",
  "o",
  "pyc",
  "woff",
  "woff2",
  "ttf",
  "otf",
]);

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
  const basename = filename.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (basename === "dockerfile" || basename === "makefile") return basename;
  if (basename.startsWith(".env")) return "env";
  if (basename === ".gitignore") return "gitignore";
  if (basename === ".editorconfig") return "editorconfig";
  const match = /\.([a-z0-9]+)$/i.exec(basename);
  return match ? match[1]!.toLowerCase() : null;
}

/** Browser and operating-system file pickers frequently provide an empty or
 *  generic MIME value for code, SVG, MOV, and archive files. Use the local
 *  filename only to improve rendering metadata; the encrypted filename and
 *  inferred MIME remain inside the E2EE attachment envelope. */
export function resolveFileMimetype(mimetype: string, filename: string): string {
  const ext = extensionOf(filename);
  const inferred = ext ? MIME_BY_EXTENSION[ext] : undefined;
  if (inferred) return inferred;
  const normalized = mimetype.split(";", 1)[0]!.trim().toLowerCase();
  return normalized || "application/octet-stream";
}

/** Returns the highlight.js language id to render a text/code attachment
 *  with, or null if this file shouldn't get the text/code preview at all
 *  (binary formats, or a generic mimetype/extension we don't recognize). */
export function detectTextLanguage(mimetype: string, filename: string): string | null {
  const ext = extensionOf(filename);
  if (ext && BINARY_EXTENSIONS.has(ext)) return null;
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

export function isMarkdown(filename: string): boolean {
  const ext = extensionOf(filename);
  return ext === "md" || ext === "markdown" || ext === "mdx";
}

export function attachmentLimitCategory(mimetype: string, filename: string): AttachmentLimitCategory {
  const effectiveMime = resolveFileMimetype(mimetype, filename);
  if (effectiveMime.startsWith("image/")) return "image";
  if (effectiveMime.startsWith("video/")) return "video";
  if (effectiveMime.startsWith("audio/")) return "audio";
  if (
    effectiveMime === "application/pdf" ||
    effectiveMime === DOCX_MIMETYPE ||
    isCsv(effectiveMime, filename) ||
    isMarkdown(filename) ||
    detectTextLanguage(effectiveMime, filename)
  ) {
    return "document";
  }
  return "other";
}

export function maxAttachmentSizeMbForFile(
  limits: AttachmentSizeLimitsDto,
  mimetype: string,
  filename: string,
): { category: AttachmentLimitCategory; limitMb: number } {
  const category = attachmentLimitCategory(mimetype, filename);
  const categoryLimit = limits[`${category}Mb`];
  return { category, limitMb: Math.min(limits.globalMb, categoryLimit) };
}

export const DOCX_MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
import type { AttachmentLimitCategory, AttachmentSizeLimitsDto } from "@anonchat/shared";
