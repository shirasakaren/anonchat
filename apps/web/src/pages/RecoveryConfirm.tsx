import { useState } from "react";
import { RecoveryPhraseDisplay } from "../components/common/RecoveryPhraseDisplay.js";

export default function RecoveryConfirm({
  phrase,
  publicId,
  onAcknowledge,
}: {
  phrase: string;
  publicId: string;
  onAcknowledge: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-sm">
        <p className="text-sm">
          Your anonymous identity has been created: <span className="font-mono font-semibold">#{publicId}</span>
        </p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Save your recovery key if you want to access this account from another device or after clearing your browser
          data. <strong>If you lose it and clear this browser, this conversation is gone for good.</strong>
        </p>
        <div className="mt-4">
          <RecoveryPhraseDisplay phrase={phrase} />
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          I've saved it
        </label>
        <button
          type="button"
          disabled={!acknowledged}
          onClick={onAcknowledge}
          className="mt-4 w-full rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
        >
          Continue to chat
        </button>
      </div>
    </div>
  );
}
