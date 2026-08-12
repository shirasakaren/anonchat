import { useState } from "react";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { ApiError } from "../../api/client.js";

export default function AdminLogin() {
  const { login } = useAdminSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password, needsTotp ? totpCode : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOTP_REQUIRED") {
        setNeedsTotp(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-6 text-center text-xl font-semibold">Admin sign in</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-sm"
      >
        <label className="block text-sm font-medium">
          Username
          <input
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
        </label>
        {needsTotp && (
          <label className="block text-sm font-medium">
            Two-factor code
            <input
              autoFocus
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
        )}
        {error && <p className="text-sm text-[var(--danger-fg)]">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
