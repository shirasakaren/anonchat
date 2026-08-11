import { useEffect, useState } from "react";
import { getAdminMe } from "../api/admin.js";
import { AnonymousSessionProvider, useAnonymousSession } from "../context/AnonymousSessionContext.js";
import { FullScreenError, FullScreenLoader } from "../components/common/Loader.js";
import PublicHome from "./PublicHome.js";
import RecoveryConfirm from "./RecoveryConfirm.js";
import Chat from "./Chat.js";

function PublicAppInner() {
  const { status, error } = useAnonymousSession();
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
  if (status === "error") return <FullScreenError message={error ?? "Something went wrong."} />;
  if (status === "needs-identity") {
    return <PublicHome onCreated={(phrase, publicId) => setPendingRecovery({ phrase, publicId })} />;
  }
  if (pendingRecovery) {
    return (
      <RecoveryConfirm phrase={pendingRecovery.phrase} publicId={pendingRecovery.publicId} onAcknowledge={() => setPendingRecovery(null)} />
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
