import { lazy, Suspense, useEffect, useState } from "react";
import { getAdminMe } from "../api/admin.js";
import { AnonymousSessionProvider, useAnonymousSession } from "../context/AnonymousSessionContext.js";
import { FullScreenError, FullScreenLoader } from "../components/common/Loader.js";
import PublicHome from "./PublicHome.js";

const Chat = lazy(() => import("./Chat.js"));

function PublicAppInner() {
  const { status, error, discardBrokenIdentity } = useAnonymousSession();
  const [discarding, setDiscarding] = useState(false);
  const [checkedAdmin, setCheckedAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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
  // Identity creation happens inside PublicHome and flips the session to
  // "ready" itself, so the visitor lands straight in the chat window - the
  // recovery key is no longer forced into a separate save-it-now screen. It
  // stays available from the key icon in the chat header.
  if (status === "needs-identity") {
    return <PublicHome />;
  }
  return (
    <Suspense fallback={<FullScreenLoader label="Opening your conversation…" />}>
      <Chat />
    </Suspense>
  );
}

export default function PublicApp() {
  return (
    <AnonymousSessionProvider>
      <PublicAppInner />
    </AnonymousSessionProvider>
  );
}
