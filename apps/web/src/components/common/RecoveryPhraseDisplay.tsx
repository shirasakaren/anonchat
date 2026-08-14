import { useState } from "react";
import { Download, Printer } from "lucide-react";

export function RecoveryPhraseDisplay({
  phrase,
  filename = "anonchat-recovery-key.txt",
}: {
  phrase: string;
  filename?: string;
}) {
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

  function download() {
    const contents = [
      "Anonchat recovery key",
      "",
      phrase,
      "",
      "Keep this file private. Anyone with this key may be able to access your encrypted conversation.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--color-accent-500)] bg-[var(--surface-muted)] p-3">
      <p className="select-all break-all font-mono text-sm leading-relaxed">{phrase}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface)]"
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface)]"
        >
          <Download size={13} aria-hidden /> Download
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface)]"
        >
          <Printer size={13} aria-hidden /> Print
        </button>
      </div>
    </div>
  );
}
