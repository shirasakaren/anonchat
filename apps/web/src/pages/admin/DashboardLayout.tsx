import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { Menu, X, MessageSquare, Settings, ShieldCheck, ClipboardList, ScrollText, UserRound } from "lucide-react";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { useUnreadCount } from "../../hooks/useUnreadCount.js";
import { LaunchGuideModal } from "../../components/admin/LaunchGuideModal.js";
import { useSite } from "../../context/SiteContext.js";

const NAV_ITEMS = [
  { to: "/admin", label: "Inbox", icon: MessageSquare, end: true },
  { to: "/admin/profile", label: "Profile", icon: UserRound },
  { to: "/admin/settings", label: "System settings", icon: Settings },
  { to: "/admin/sessions", label: "Sessions", icon: ShieldCheck },
  { to: "/admin/canned-replies", label: "Canned replies", icon: ClipboardList },
  { to: "/admin/audit-log", label: "Audit log", icon: ScrollText },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { admin, logout } = useAdminSession();
  const { site } = useSite();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showLaunchGuide, setShowLaunchGuide] = useState(() => {
    const shouldShow = sessionStorage.getItem("anonchat.showLaunchGuide") === "true";
    if (shouldShow) sessionStorage.removeItem("anonchat.showLaunchGuide");
    return shouldShow;
  });
  const unreadCount = useUnreadCount();

  const closeMobileNav = () => setMobileNavOpen(false);

  const navLinks = NAV_ITEMS.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={closeMobileNav}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
          isActive ? "bg-[var(--chip-bg)] font-medium text-[var(--chip-fg)]" : "hover:bg-[var(--surface-muted)]",
        )
      }
    >
      <item.icon size={16} aria-hidden />
      {item.label}
      {item.to === "/admin" && unreadCount > 0 && (
        <span className="ml-auto rounded-full bg-[var(--btn-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--btn-fg)]">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </NavLink>
  ));

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar (md and up). */}
      <nav className="hidden w-56 flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] p-3 md:flex">
        <div className="mb-4 px-2">
          <p className="truncate text-sm font-semibold">{site?.siteTitle ?? "Anonchat"}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{admin?.displayName}</p>
        </div>
        <div className="flex-1 space-y-1">{navLinks}</div>
        <button
          type="button"
          onClick={() => logout()}
          className="rounded-lg px-3 py-2 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
        >
          Logout
        </button>
      </nav>

      {/* Mobile: slim top bar + slide-over nav drawer. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-raised)] px-3 md:hidden">
          <p className="truncate text-sm font-semibold">{site?.siteTitle ?? "Anonchat"}</p>
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label={unreadCount > 0 ? `Open navigation menu, ${unreadCount} unread` : "Open navigation menu"}
            className="relative rounded-lg p-2 hover:bg-[var(--surface-muted)]"
          >
            <Menu size={18} aria-hidden />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--btn-bg)]" aria-hidden />
            )}
          </button>
        </header>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobileNav} />
          <nav className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] p-3">
            <div className="mb-4 flex items-start justify-between px-2">
              <div>
                <p className="truncate text-sm font-semibold">{site?.siteTitle ?? "Anonchat"}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">{admin?.displayName}</p>
              </div>
              <button
                type="button"
                onClick={closeMobileNav}
                aria-label="Close navigation menu"
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="flex-1 space-y-1">{navLinks}</div>
            <button
              type="button"
              onClick={() => {
                closeMobileNav();
                void logout();
              }}
              className="rounded-lg px-3 py-2 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
            >
              Logout
            </button>
          </nav>
        </div>
      )}
      {showLaunchGuide && admin && (
        <LaunchGuideModal adminName={admin.displayName} onClose={() => setShowLaunchGuide(false)} />
      )}
    </div>
  );
}
