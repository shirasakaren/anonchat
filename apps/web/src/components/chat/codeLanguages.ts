import hljs from "highlight.js/lib/core";

import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * A curated subset, not highlight.js's full ~190-language catalog (which
 * would roughly double this app's already-flagged bundle size - see
 * docs/STATUS.md "Known gaps"). Registering `highlight.js/lib/core` +
 * individual `highlight.js/lib/languages/*` modules (rather than the
 * default `highlight.js` entry point) is what keeps only these selected.
 *
 * Each entry's `label` is what both the code-block language picker (the
 * Composer's Teams-style code modal) and the rendered block's header show.
 */
export const SUPPORTED_LANGUAGES: { id: string; label: string }[] = [
  { id: "plaintext", label: "Plain Text" },
  { id: "bash", label: "Bash" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "css", label: "CSS" },
  { id: "diff", label: "Diff" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "go", label: "Go" },
  { id: "graphql", label: "GraphQL" },
  { id: "ini", label: "INI / TOML" },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "kotlin", label: "Kotlin" },
  { id: "lua", label: "Lua" },
  { id: "markdown", label: "Markdown" },
  { id: "php", label: "PHP" },
  { id: "python", label: "Python" },
  { id: "ruby", label: "Ruby" },
  { id: "rust", label: "Rust" },
  { id: "sql", label: "SQL" },
  { id: "swift", label: "Swift" },
  { id: "typescript", label: "TypeScript" },
  { id: "xml", label: "HTML / XML" },
  { id: "yaml", label: "YAML" },
];

let registered = false;

/** Idempotent - safe to call from multiple entry points (renderer, modal). */
export function ensureLanguagesRegistered(): typeof hljs {
  if (registered) return hljs;
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("c", c);
  hljs.registerLanguage("cpp", cpp);
  hljs.registerLanguage("csharp", csharp);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("diff", diff);
  hljs.registerLanguage("dockerfile", dockerfile);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("graphql", graphql);
  hljs.registerLanguage("ini", ini);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("kotlin", kotlin);
  hljs.registerLanguage("lua", lua);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("php", php);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("ruby", ruby);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("shell", shell);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("swift", swift);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("yaml", yaml);
  registered = true;
  return hljs;
}

export function languageLabel(id: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
