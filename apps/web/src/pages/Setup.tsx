import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onboardAdmin } from "../api/admin.js";
import { getSiteInfo } from "../api/site.js";
import { ApiError } from "../api/client.js";
import { createAndCacheAdminIdentity } from "../crypto/adminKeyStore.js";
import { useSite } from "../context/SiteContext.js";
import { FullScreenLoader } from "../components/common/Loader.js";
import { RecoveryPhraseDisplay } from "../components/common/RecoveryPhraseDisplay.js";

type Step = "welcome" | "profile" | "credentials" | "recovery" | "done";

/**
 * Module-level, not React state, so it survives this component remounting
 * mid-transition (observed: the surrounding router re-renders once
 * onboarding flips the shared site info, which can remount whichever route
 * is currently active). Sets true the moment onboarding succeeds; the
 * mount-check effect below reads it to avoid re-deciding "already
 * onboarded -> redirect to /" out from under a navigation already in
 * flight to /admin.
 */
let setupCompletionInFlight = false;

export default function Setup() {
  const navigate = useNavigate();
  const { refresh: refreshSite } = useSite();
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [step, setStep] = useState<Step>("welcome");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIdentity, setPendingIdentity] = useState<Awaited<ReturnType<typeof createAndCacheAdminIdentity>>["identity"] | null>(null);

  // One-time, independent check on mount - deliberately NOT tied to the
  // shared SiteContext value, since this component's own completion flow
  // is what flips that value true. Reacting to it here would redirect this
  // page out from under itself mid-navigation. See App.tsx for the full
  // explanation.
  useEffect(() => {
    if (setupCompletionInFlight) {
      setCheckingExisting(false);
      return;
    }
    let cancelled = false;
    getSiteInfo()
      .then((info) => {
        if (cancelled) return;
        if (info.onboardingComplete) navigate("/", { replace: true });
        else setCheckingExisting(false);
      })
      .catch(() => {
        if (!cancelled) setCheckingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    const { identity, recoveryPhrase: phrase } = await createAndCacheAdminIdentity(password);
    setPendingIdentity(identity);
    setRecoveryPhrase(phrase);
    setStep("recovery");
  }

  async function handleFinish() {
    if (!pendingIdentity) return;
    setSubmitting(true);
    setError(null);
    try {
      await onboardAdmin({ username, password, displayName, identity: pendingIdentity });
      setupCompletionInFlight = true;
      setStep("done");
      // Refreshes the shared site info for this tab's future navigations
      // (e.g. later visiting "/"). Deliberately not awaited before
      // navigating - /admin doesn't depend on it, and awaiting it here
      // would re-render this route with the new value while still on it.
      void refreshSite();
      setTimeout(() => navigate("/admin", { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Setup failed. Please try again.");
      setSubmitting(false);
    }
  }

  if (checkingExisting) return <FullScreenLoader />;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--color-accent-600)]">First-time setup</p>
        <h1 className="mt-1 text-2xl font-semibold">Welcome to Termine</h1>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-sm">
        {step === "welcome" && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              This is a one-time setup. You'll create your admin account and an encryption identity so anonymous
              conversations sent to you are end-to-end encrypted. No one else will be able to run this step once
              it's done.
            </p>
            <button
              type="button"
              onClick={() => setStep("profile")}
              className="w-full rounded-lg bg-[var(--color-accent-600)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-700)]"
            >
              Get started
            </button>
          </div>
        )}

        {step === "profile" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setStep("credentials");
            }}
          >
            <label className="block text-sm font-medium">
              Your display name
              <input
                autoFocus
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-[var(--text-muted)]">Shown to anonymous visitors as who they're talking to.</p>
            <button type="submit" className="w-full rounded-lg bg-[var(--color-accent-600)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-700)]">
              Continue
            </button>
          </form>
        )}

        {step === "credentials" && (
          <form className="space-y-4" onSubmit={handleCredentialsSubmit}>
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
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Confirm password
              <input
                required
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" className="w-full rounded-lg bg-[var(--color-accent-600)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-700)]">
              Continue
            </button>
          </form>
        )}

        {step === "recovery" && recoveryPhrase && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-muted)]">
              This is your <strong>encryption recovery key</strong>. It decrypts every conversation you'll ever
              receive. Save it somewhere safe - a password manager is ideal. If you lose it and ever log in from a
              new browser, past messages become permanently unreadable.
            </p>
            <RecoveryPhraseDisplay phrase={recoveryPhrase} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
              I've saved my recovery key
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="button"
              disabled={!acknowledged || submitting}
              onClick={handleFinish}
              className="w-full rounded-lg bg-[var(--color-accent-600)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-700)] disabled:opacity-50"
            >
              {submitting ? "Finishing setup…" : "Finish setup"}
            </button>
          </div>
        )}

        {step === "done" && <p className="text-center text-sm">All set. Taking you to your dashboard…</p>}
      </div>
    </div>
  );
}
