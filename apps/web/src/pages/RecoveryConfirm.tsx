import { useState } from "react";
import { RecoveryPhraseVerification } from "../components/common/RecoveryPhraseVerification.js";

export default function RecoveryConfirm({
  phrase,
  publicId,
  onAcknowledge,
}: {
  phrase: string;
  publicId: string;
  onAcknowledge: () => void;
}) {
  const [verified, setVerified] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold">Save your recovery key</h1>
        <p className="text-sm">
          Your anonymous identity has been created: <span className="font-mono font-semibold">#{publicId}</span>
        </p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Save your recovery key if you want to access this account from another device or after clearing your browser
          data. <strong>If you lose it and clear this browser, this conversation is gone for good.</strong>
        </p>
        <div className="mt-4">
          <RecoveryPhraseVerification
            phrase={phrase}
            filename={`anonchat-${publicId}-recovery-key.txt`}
            verified={verified}
            onVerifiedChange={setVerified}
          />
        </div>
        <button
          type="button"
          disabled={!verified}
          onClick={onAcknowledge}
          className="mt-4 w-full rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
        >
          Continue to chat
        </button>
      </div>
    </main>
  );
}
