import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAdminSession } from "../../context/AdminSessionContext.js";

const NAV_ITEMS = [
  { to: "/admin", label: "Inbox", icon: "💬", end: true },
  { to: "/admin/settings", label: "Settings", icon: "⚙️" },
  { to: "/admin/sessions", label: "Sessions", icon: "🔐" },
  { to: "/admin/canned-replies", label: "Canned replies", icon: "📋" },
  { to: "/admin/audit-log", label: "Audit log", icon: "📜" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { admin, logout } = useAdminSession();

  return (
    <div className="flex h-screen">
      <nav className="flex w-56 flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] p-3">
        <div className="mb-4 px-2">
          <p className="text-sm font-semibold">Termine</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{admin?.displayName}</p>
        </div>
        <div className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  isActive ? "bg-[var(--color-accent-100)] font-medium text-[var(--color-accent-700)]" : "hover:bg-[var(--surface-muted)]",
                )
              }
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
        <button type="button" onClick={() => logout()} className="rounded-lg px-3 py-2 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)]">
          Logout
        </button>
      </nav>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
