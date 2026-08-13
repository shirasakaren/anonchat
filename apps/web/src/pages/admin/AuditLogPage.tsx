import { useEffect, useState } from "react";
import { format } from "date-fns";
import type { AuditLogEntryDto } from "@anonchat/shared";
import { listAuditLog } from "../../api/admin.js";
import { FullScreenLoader } from "../../components/common/Loader.js";
import { describeAuditAction } from "./auditLogLabels.js";

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntryDto[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    listAuditLog().then((res) => {
      setEntries(res.entries);
      setCursor(res.nextCursor);
    });
  }, []);

  if (!entries) return <FullScreenLoader />;

  async function loadMore() {
    if (!cursor) return;
    const res = await listAuditLog(cursor);
    setEntries((prev) => [...(prev ?? []), ...res.entries]);
    setCursor(res.nextCursor);
  }

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto p-6">
      <h1 className="mb-6 text-xl font-semibold">Audit log</h1>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
          <p>No activity recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span>
                {describeAuditAction(entry.action)}
                {entry.targetType && <span className="text-[var(--text-muted)]"> · {entry.targetType}</span>}
              </span>
              <span className="text-xs text-[var(--text-muted)]">{format(new Date(entry.createdAt), "PPp")}</span>
            </div>
          ))}
        </div>
      )}
      {cursor && (
        <button type="button" onClick={loadMore} className="mt-4 text-sm text-[var(--link-fg)] hover:underline">
          Load more
        </button>
      )}
    </div>
  );
}
