import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";
import { useSite } from "../context/SiteContext.js";
import { useAnonymousSession } from "../context/AnonymousSessionContext.js";
import { listIdentities, type IdentitySummary } from "../crypto/identityStore.js";
import { ApiError } from "../api/client.js";
import { DefaultAvatar } from "../components/common/DefaultAvatar.js";

type View = "landing" | "name" | "import";

export default function PublicHome({ onCreated }: { onCreated: (phrase: string, publicId: string) => void }) {
  const { site } = useSite();
  const { createNewIdentity, continueWithStoredIdentity, importFromRecoveryPhrase } = useAnonymousSession();
  const [identities, setIdentities] = useState<IdentitySummary[]>([]);
  const [view, setView] = useState<View>("landing");
  const [importText, setImportText] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    void listIdentities()
      .then(setIdentities)
      .catch(() => setIdentities([]));
  }, []);

  async function handleCreate(name?: string) {
    setBusy(true);
    setError(null);
    try {
      const { recoveryPhrase, publicId } = await createNewIdentity(name);
      onCreated(recoveryPhrase, publicId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your identity. Please try again.");
      setBusy(false);
    }
  }

  async function handleContinue(publicId: string) {
    setBusy(true);
    setError(null);
    try {
      await continueWithStoredIdentity(publicId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not restore that identity.");
      setBusy(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await importFromRecoveryPhrase(importText.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That recovery key doesn't look right.");
      setBusy(false);
    }
  }

  const ownerName = site?.displayName ?? "the site owner";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        {site &&
          (site.avatarUrl ? (
            <img src={site.avatarUrl} alt="" className="mx-auto mb-4 h-16 w-16 rounded-full object-cover" />
          ) : (
            <DefaultAvatar name={ownerName} className="mx-auto mb-4 h-16 w-16 text-2xl" />
          ))}
        <h1 className="text-2xl font-semibold">Message {ownerName} anonymously</h1>
        {site?.bio && <p className="mt-2 text-sm text-[var(--text-muted)]">{site.bio}</p>}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6 shadow-sm">
        {view === "landing" && (
          <div className="space-y-4">
            {identities.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Continue as:</p>
                {identities.map((identity) => (
                  <button
                    key={identity.publicId}
                    type="button"
                    disabled={busy}
                    onClick={() => handleContinue(identity.publicId)}
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-muted)] disabled:opacity-50"
                  >
                    <span>{identity.label === "Anonymous" ? `Anonymous #${identity.publicId}` : identity.label}</span>
                    <ArrowRight size={16} aria-hidden />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setView("name")}
              className="w-full rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
            >
              {identities.length > 0 ? "Create a new anonymous identity" : "Start anonymous chat"}
            </button>
            <button
              type="button"
              onClick={() => setView("import")}
              className="w-full text-center text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
            >
              Have a recovery key from another device?
            </button>
            {error && <p className="text-sm text-[var(--danger-fg)]">{error}</p>}
          </div>
        )}

        {view === "name" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate(displayName);
            }}
          >
            <div>
              <label className="block text-sm font-medium" htmlFor="identity-name">
                Name this identity
              </label>
              <input
                id="identity-name"
                autoFocus
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Optional name"
                className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
              />
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Optional. The admin will see this name, and you can skip it to stay Anonymous #XXXX-XXXX-XXXX.
              </p>
            </div>
            {error && <p className="text-sm text-[var(--danger-fg)]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCreate()}
                className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
              >
                Continue
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setView("landing")}
              className="w-full text-center text-xs text-[var(--text-muted)] underline underline-offset-2"
            >
              Back
            </button>
          </form>
        )}

        {view === "import" && (
          <form className="space-y-4" onSubmit={handleImport}>
            <label className="block text-sm font-medium">
              Recovery key
              <textarea
                required
                rows={3}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste your recovery key…"
                className="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 font-mono text-sm"
              />
            </label>
            {error && <p className="text-sm text-[var(--danger-fg)]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView("landing")}
                className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--surface-muted)]"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-50"
              >
                Restore
              </button>
            </div>
          </form>
        )}
      </div>

      {/* The privacy/security notes moved below the identity card and stay
          tucked behind "Show details" so the create-identity box stays the
          single focus of the screen. */}
      <button
        type="button"
        onClick={() => setShowDetails((value) => !value)}
        aria-expanded={showDetails}
        className="mx-auto mt-5 flex items-center gap-1 text-center text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
      >
        {showDetails ? "Hide details" : "Show details"}
        <ChevronDown size={12} aria-hidden className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>
      {showDetails && (
        <div className="mt-3 space-y-2 text-center">
          <p className="text-sm text-[var(--text-muted)]">No email. No account. No name required.</p>
          <p className="flex items-start justify-center gap-1.5 text-xs text-[var(--text-muted)]">
            <ShieldCheck size={14} className="mt-px shrink-0 text-[var(--link-fg)]" aria-hidden />
            End-to-end encrypted - only your identity and {ownerName}'s key can decrypt these messages.
          </p>
          {site?.visitorInsights.collectsIpAddress && (
            <p className="text-xs text-[var(--text-muted)]">
              This operator has enabled IP-address retention for abuse prevention.
              {site.privacyPolicyUrl ? " See the privacy policy below for details." : " Ask the operator for details."}
            </p>
          )}
        </div>
      )}

      {site?.privacyPolicyUrl && (
        <a
          href={site.privacyPolicyUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 text-center text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
        >
          Privacy policy
        </a>
      )}
    </main>
  );
}
