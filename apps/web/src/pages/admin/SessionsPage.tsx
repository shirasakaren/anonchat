import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Laptop, Smartphone, Tablet } from "lucide-react";
import type { AdminSessionDto } from "@anonchat/shared";
import { listAdminSessions, revokeAdminSession } from "../../api/admin.js";
import { FullScreenLoader } from "../../components/common/Loader.js";
import { getDeviceType, parseUserAgent } from "./userAgentLabel.js";

const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Laptop } as const;

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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-6 text-xl font-semibold">Active sessions</h1>
        <div className="space-y-2">
          {sessions.map((session) => {
            const DeviceIcon = DEVICE_ICONS[getDeviceType(session.userAgent)];
            return (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4"
              >
                <div className="flex items-start gap-3">
                  <DeviceIcon size={18} className="mt-0.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
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
                      {parseUserAgent(session.userAgent)} · Last active{" "}
                      {formatDistanceToNowStrict(new Date(session.lastSeenAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(session.id)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]"
                  >
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
