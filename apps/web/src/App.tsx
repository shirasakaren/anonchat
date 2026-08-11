import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { SiteProvider, useSite } from "./context/SiteContext.js";
import { FullScreenError, FullScreenLoader } from "./components/common/Loader.js";
import Setup from "./pages/Setup.js";
import PublicApp from "./pages/PublicApp.js";
import AdminApp from "./pages/AdminApp.js";

function RootRouter() {
  const { site, loading, error } = useSite();

  if (loading) return <FullScreenLoader label="Loading Termine…" />;
  if (error || !site) return <FullScreenError message={error ?? "The site could not be loaded."} />;

  return (
    <Routes>
      <Route path="/setup" element={site.onboardingComplete ? <Navigate to="/" replace /> : <Setup />} />
      <Route
        path="/admin/*"
        element={site.onboardingComplete ? <AdminApp /> : <Navigate to="/setup" replace />}
      />
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
