import { useState } from "react";
import { useAdminSession } from "../../context/AdminSessionContext.js";

export default function UnlockKey() {
  const { unlockKey, importKey } = useAdminSession();
  const [mode, setMode] = useState<"unlock" | "import">("unlock");
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlockKey(password);
    } catch {
      setError("That password didn't unlock the cached key on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await importKey(phrase.trim(), password);
    } catch {
      setError("That recovery key doesn't look right.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 text-center text-xl font-semibold">Unlock message decryption</h1>
      <p className="mb-6 text-center text-sm text-[var(--text-muted)]">
        You're signed in, but this browser needs to unlock your encryption key before it can decrypt conversations.
      </p>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-sm">
        {mode === "unlock" ? (
          <form onSubmit={handleUnlock} className="space-y-4">
            <label className="block text-sm font-medium">
              Your login password
              <input
                autoFocus
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
            >
              Unlock
            </button>
            <button
              type="button"
              onClick={() => setMode("import")}
              className="w-full text-center text-xs text-[var(--text-muted)] underline"
            >
              This is a new device - use my recovery key instead
            </button>
          </form>
        ) : (
          <form onSubmit={handleImport} className="space-y-4">
            <label className="block text-sm font-medium">
              Encryption recovery key
              <textarea
                autoFocus
                required
                rows={3}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Your login password (to cache the key on this device)
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("unlock")}
                className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
              >
                Unlock
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
