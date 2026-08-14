import { useId, useState } from "react";
import { RecoveryPhraseDisplay } from "./RecoveryPhraseDisplay.js";

export function normalizeRecoveryPhrase(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

interface Props {
  phrase: string;
  filename?: string;
  verified: boolean;
  onVerifiedChange: (verified: boolean) => void;
}

/**
 * Makes the person retrieve the key from the copy they just stored. The
 * source key is hidden during verification so a checked box cannot create
 * false confidence that the only decryption secret was actually backed up.
 */
export function RecoveryPhraseVerification({ phrase, filename, verified, onVerifiedChange }: Props) {
  const inputId = useId();
  const [verifying, setVerifying] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function beginVerification() {
    setCandidate("");
    setError(null);
    onVerifiedChange(false);
    setVerifying(true);
  }

  function verify() {
    if (normalizeRecoveryPhrase(candidate) !== normalizeRecoveryPhrase(phrase)) {
      setError("That key doesn't match. Retrieve the saved copy and try again.");
      onVerifiedChange(false);
      return;
    }
    setError(null);
    onVerifiedChange(true);
  }

  if (!verifying) {
    return (
      <div className="space-y-3">
        <RecoveryPhraseDisplay phrase={phrase} filename={filename} />
        <button
          type="button"
          onClick={beginVerification}
          className="w-full rounded-lg border border-[var(--border-strong)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--surface-muted)]"
        >
          I've stored it - verify my backup
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div>
        <label htmlFor={inputId} className="text-sm font-semibold">
          Verify your saved recovery key
        </label>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          The on-screen copy is hidden. Retrieve the key you saved, then paste or type it below.
        </p>
      </div>
      <textarea
        id={inputId}
        autoFocus
        rows={3}
        spellCheck={false}
        autoCapitalize="characters"
        autoComplete="off"
        value={candidate}
        onChange={(event) => {
          setCandidate(event.target.value);
          setError(null);
          onVerifiedChange(false);
        }}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${inputId}-error` : `${inputId}-help`}
        className="w-full resize-none rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-sm"
      />
      <span id={`${inputId}-help`} className="sr-only">
        Spaces, hyphens, and letter case do not affect matching.
      </span>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      {verified && (
        <p role="status" className="text-xs font-medium text-[var(--text)]">
          Recovery key verified.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={verify}
          disabled={!candidate.trim() || verified}
          className="rounded-lg bg-[var(--btn-bg)] px-3 py-2 text-xs font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
        >
          {verified ? "Verified" : "Verify recovery key"}
        </button>
        <button
          type="button"
          onClick={() => {
            setVerifying(false);
            setCandidate("");
            setError(null);
            onVerifiedChange(false);
          }}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-raised)]"
        >
          Show key again
        </button>
      </div>
    </div>
  );
}
