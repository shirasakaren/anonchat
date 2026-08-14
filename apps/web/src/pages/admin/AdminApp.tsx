import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AdminSessionProvider, useAdminSession } from "../../context/AdminSessionContext.js";
import { FullScreenLoader } from "../../components/common/Loader.js";
import AdminLogin from "./AdminLogin.js";
import UnlockKey from "./UnlockKey.js";
import DashboardLayout from "./DashboardLayout.js";
import { GlobalNotifications } from "./GlobalNotifications.js";

const Inbox = lazy(() => import("./Inbox.js"));
const SettingsPage = lazy(() => import("./SettingsPage.js"));
const SessionsPage = lazy(() => import("./SessionsPage.js"));
const CannedRepliesPage = lazy(() => import("./CannedRepliesPage.js"));
const AuditLogPage = lazy(() => import("./AuditLogPage.js"));

function AdminAppInner() {
  const { status, needsKeyUnlock } = useAdminSession();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "signed-out") return <AdminLogin />;
  if (needsKeyUnlock) return <UnlockKey />;

  return (
    <DashboardLayout>
      <GlobalNotifications />
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/" element={<Inbox />} />
          <Route path="/c/:conversationId" element={<Inbox />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/canned-replies" element={<CannedRepliesPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
        </Routes>
      </Suspense>
    </DashboardLayout>
  );
}

export default function AdminApp() {
  return (
    <AdminSessionProvider>
      <AdminAppInner />
    </AdminSessionProvider>
  );
}
