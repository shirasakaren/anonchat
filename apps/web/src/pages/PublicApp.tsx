import { useEffect, useState } from "react";
import { getAdminMe } from "../api/admin.js";
import { AnonymousSessionProvider, useAnonymousSession } from "../context/AnonymousSessionContext.js";
import { FullScreenError, FullScreenLoader } from "../components/common/Loader.js";
import PublicHome from "./PublicHome.js";
import RecoveryConfirm from "./RecoveryConfirm.js";
import Chat from "./Chat.js";

function PublicAppInner() {
  const { status, error, discardBrokenIdentity } = useAnonymousSession();
  const [discarding, setDiscarding] = useState(false);
  const [checkedAdmin, setCheckedAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<{ phrase: string; publicId: string } | null>(null);

  useEffect(() => {
    getAdminMe()
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false))
      .finally(() => setCheckedAdmin(true));
  }, []);

  if (!checkedAdmin) return <FullScreenLoader />;
  if (isAdmin) {
    window.location.assign("/admin");
    return <FullScreenLoader label="Redirecting to your dashboard…" />;
  }

  if (status === "loading") return <FullScreenLoader label="Restoring your conversation…" />;
  if (status === "error") {
    return (
      <FullScreenError
        message={error ?? "Something went wrong."}
        actions={
          <>
            <button
              type="button"
              disabled={discarding}
              onClick={async () => {
                setDiscarding(true);
                await discardBrokenIdentity();
              }}
              className="w-full rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-60"
            >
              {discarding ? "Starting over…" : "Start a new anonymous chat"}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-lg border border-[var(--border-strong)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--surface-muted)]"
            >
              Try again
            </button>
          </>
        }
      />
    );
  }
  if (status === "needs-identity") {
    return <PublicHome onCreated={(phrase, publicId) => setPendingRecovery({ phrase, publicId })} />;
  }
  if (pendingRecovery) {
    return (
      <RecoveryConfirm
        phrase={pendingRecovery.phrase}
        publicId={pendingRecovery.publicId}
        onAcknowledge={() => setPendingRecovery(null)}
      />
    );
  }
  return <Chat />;
}

export default function PublicApp() {
  return (
    <AnonymousSessionProvider>
      <PublicAppInner />
    </AnonymousSessionProvider>
  );
}
