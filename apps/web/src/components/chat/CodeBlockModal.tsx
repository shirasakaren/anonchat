import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "./codeLanguages.js";

interface Props {
  onInsert: (code: string, language: string) => void;
  onClose: () => void;
}

/** Teams-style "insert a code snippet" dialog, opened when the composer
 *  detects a fresh ``` fence. Inserts into the compose text on confirm;
 *  the message still isn't sent until the user does that themselves. */
export function CodeBlockModal({ onInsert, onClose }: Props) {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("plaintext");
  const codeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  function handleInsert() {
    if (!code.trim()) return;
    onInsert(code, language);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleInsert();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Insert a code block"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Insert a code block</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-md border border-[var(--border-strong)] bg-transparent px-2 py-1.5 text-sm text-[var(--text)]"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <textarea
          ref={codeRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste or type your code…"
          rows={10}
          spellCheck={false}
          className="min-h-[12rem] w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--surface-muted)] p-3 font-mono text-sm"
        />

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-muted)]">⌘/Ctrl+Enter to insert</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleInsert}
              disabled={!code.trim()}
              className="rounded-lg bg-[var(--btn-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-40"
            >
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
