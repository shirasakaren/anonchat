import { useState } from "react";

export function RecoveryPhraseDisplay({ phrase }: { phrase: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable - user can still select the text manually
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--color-accent-500)] bg-[var(--surface-muted)] p-3">
      <p className="select-all break-all font-mono text-sm leading-relaxed">{phrase}</p>
      <button
        type="button"
        onClick={copy}
        className="mt-2 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium hover:bg-[var(--surface)]"
      >
        {copied ? "Copied!" : "Copy to clipboard"}
      </button>
    </div>
  );
}
