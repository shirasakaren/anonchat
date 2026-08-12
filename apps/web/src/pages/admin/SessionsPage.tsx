import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import type { AdminSessionDto } from "@anonchat/shared";
import { listAdminSessions, revokeAdminSession } from "../../api/admin.js";
import { FullScreenLoader } from "../../components/common/Loader.js";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<AdminSessionDto[] | null>(null);

  function load() {
    listAdminSessions().then(setSessions);
  }

  useEffect(() => {
    load();
  }, []);

  if (!sessions) return <FullScreenLoader />;

  async function handleRevoke(id: string) {
    await revokeAdminSession(id);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto p-6">
      <h1 className="mb-6 text-xl font-semibold">Active sessions</h1>
      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4"
          >
            <div>
              <p className="text-sm font-medium">
                {session.current && (
                  <span className="mr-1.5 rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-xs text-[var(--chip-fg)]">
                    This device
                  </span>
                )}
                {session.ipAddress ?? "Unknown IP"}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {session.userAgent ?? "Unknown device"} · Last active{" "}
                {formatDistanceToNowStrict(new Date(session.lastSeenAt), { addSuffix: true })}
              </p>
            </div>
            {!session.current && (
              <button
                type="button"
                onClick={() => handleRevoke(session.id)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-red-500"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
