import { useEffect } from "react";
import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { SiteProvider, useSite } from "./context/SiteContext.js";
import { useTheme } from "./context/ThemeContext.js";
import { FullScreenError, FullScreenLoader } from "./components/common/Loader.js";
import Setup from "./pages/Setup.js";
import PublicApp from "./pages/PublicApp.js";
import AdminApp from "./pages/admin/AdminApp.js";

/**
 * /admin is intentionally NOT gated on site.onboardingComplete - AdminApp
 * already enforces real access control itself (an authenticated
 * getAdminMe() call), so a client-side "has onboarding run yet?" check here
 * was redundant. It also actively broke the moment right after finishing
 * setup: Setup.tsx is what flips onboardingComplete true, and reacting to
 * that change while the route tree re-renders caused an unrelated remount
 * of /setup's own content, replaying its "already onboarded?" redirect
 * mid-navigation and bouncing through a hard window.location reload that
 * wiped the freshly-created in-memory encryption key (see SECURITY.md).
 * /setup keeps its own one-time, non-reactive "already onboarded?" check
 * instead (see Setup.tsx), and "/" still needs the live value since a
 * regular visitor's tab has no other way to know onboarding is done.
 */
function RootRouter() {
  const { site, loading, error, refresh } = useSite();
  const { syncFromServer } = useTheme();

  // Adopt the server-side theme on first load (only if the user hasn't
  // already set a local preference).
  useEffect(() => {
    if (site?.theme) syncFromServer(site.theme);
  }, [site?.theme, syncFromServer]);

  if (loading) return <FullScreenLoader label="Loading Anonchat…" />;
  if (error || !site) {
    return (
      <FullScreenError
        message={error ?? "The site could not be loaded."}
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="w-full rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
          >
            Try again
          </button>
        }
      />
    );
  }

  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/*" element={site.onboardingComplete ? <PublicApp /> : <Navigate to="/setup" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SiteProvider>
        <RootRouter />
      </SiteProvider>
    </BrowserRouter>
  );
}
