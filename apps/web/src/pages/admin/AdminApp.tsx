import { Route, Routes } from "react-router-dom";
import { AdminSessionProvider, useAdminSession } from "../../context/AdminSessionContext.js";
import { FullScreenLoader } from "../../components/common/Loader.js";
import AdminLogin from "./AdminLogin.js";
import UnlockKey from "./UnlockKey.js";
import DashboardLayout from "./DashboardLayout.js";
import Inbox from "./Inbox.js";
import SettingsPage from "./SettingsPage.js";
import SessionsPage from "./SessionsPage.js";
import CannedRepliesPage from "./CannedRepliesPage.js";
import AuditLogPage from "./AuditLogPage.js";
import { GlobalNotifications } from "./GlobalNotifications.js";

function AdminAppInner() {
  const { status, needsKeyUnlock } = useAdminSession();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "signed-out") return <AdminLogin />;
  if (needsKeyUnlock) return <UnlockKey />;

  return (
    <DashboardLayout>
      <GlobalNotifications />
      <Routes>
        <Route path="/" element={<Inbox />} />
        <Route path="/c/:conversationId" element={<Inbox />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/canned-replies" element={<CannedRepliesPage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
      </Routes>
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
