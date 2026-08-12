import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { Menu, X, MessageSquare, Settings, ShieldCheck, ClipboardList, ScrollText } from "lucide-react";
import { useAdminSession } from "../../context/AdminSessionContext.js";

const NAV_ITEMS = [
  { to: "/admin", label: "Inbox", icon: MessageSquare, end: true },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/sessions", label: "Sessions", icon: ShieldCheck },
  { to: "/admin/canned-replies", label: "Canned replies", icon: ClipboardList },
  { to: "/admin/audit-log", label: "Audit log", icon: ScrollText },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { admin, logout } = useAdminSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    </NavLink>
  ));

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar (md and up). */}
      <nav className="hidden w-56 flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] p-3 md:flex">
        <div className="mb-4 px-2">
          <p className="text-sm font-semibold">Anonchat</p>
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
          <p className="text-sm font-semibold">Anonchat</p>
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"
          >
            <Menu size={18} aria-hidden />
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
                <p className="text-sm font-semibold">Anonchat</p>
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
    </div>
  );
}
