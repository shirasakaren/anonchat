import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import type { AdminConversationSummaryDto, ServerWsEvent } from "@anonchat/shared";
import { listConversations } from "../../api/admin.js";
import { decryptMessageText, getConversationKey } from "../../crypto/conversationCrypto.js";
import { getAdminMessages } from "../../api/admin.js";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket.js";

type StatusFilter = "ALL" | "UNREAD" | "READ" | "ACTIVE" | "ARCHIVED" | "BLOCKED";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "BLOCKED", label: "Blocked" },
];

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  refreshToken: number;
}

export function ConversationList({ selectedId, onSelect, refreshToken }: Props) {
  const { identity } = useAdminSession();
  const [conversations, setConversations] = useState<AdminConversationSummaryDto[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveToken, setLiveToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listConversations({ status: filter, q: search || undefined })
      .then((res) => {
        if (cancelled) return;
        setConversations(res.conversations);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, search, refreshToken, liveToken]);

  // The list otherwise only learns about a brand-new conversation or an
  // out-of-view conversation's new message on the next manual filter/search
  // change - this is what makes a first-time message show up immediately
  // (spec: "the admin should immediately see the new conversation").
  const handleLiveEvent = useCallback((event: ServerWsEvent) => {
    if (event.type === "message.created") {
      // Invalidate this conversation's cached preview so the effect below
      // refetches its now-stale "last message" text.
      setPreviews((prev) => {
        if (!(event.conversationId in prev)) return prev;
        const { [event.conversationId]: _removed, ...rest } = prev;
        return rest;
      });
      setLiveToken((n) => n + 1);
    } else if (event.type === "conversation.updated") {
      setLiveToken((n) => n + 1);
    }
  }, []);
  useRealtimeSocket(handleLiveEvent, true);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const conv of conversations) {
        if (previews[conv.id]) continue;
        try {
          const key = getConversationKey(identity, conv.anonymousExchangePublicKey, conv.id);
          const page = await getAdminMessages(conv.id);
          const last = page.messages[page.messages.length - 1];
          if (last?.content) updates[conv.id] = decryptMessageText(key, last.content);
          else if (last?.deleted) updates[conv.id] = "Message deleted";
          else if (last) updates[conv.id] = "📎 Attachment";
        } catch {
          updates[conv.id] = "";
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setPreviews((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversations, identity]);

  return (
    <div className="flex h-full w-80 flex-col border-r border-[var(--border)]">
      <div className="border-b border-[var(--border)] p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID…"
          className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={clsx(
                "rounded-full px-2.5 py-1 text-xs",
                filter === f.value
                  ? "bg-[var(--color-accent-600)] text-white"
                  : "bg-[var(--surface-muted)] text-[var(--text-muted)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-center text-sm text-[var(--text-muted)]">Loading…</p>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-muted)]">
            <p>No conversations yet.</p>
            <p className="mt-1">When someone sends you an anonymous message, their conversation will appear here.</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv.id)}
              className={clsx(
                "flex w-full flex-col gap-0.5 border-b border-[var(--border)] px-4 py-3 text-left",
                selectedId === conv.id ? "bg-[var(--color-accent-50)]" : "hover:bg-[var(--surface-muted)]",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span
                    className={clsx(
                      "h-2 w-2 rounded-full",
                      conv.unreadCount > 0 ? "bg-[var(--color-accent-500)]" : "bg-transparent",
                    )}
                  />
                  Anonymous #{conv.publicId}
                </span>
                {conv.lastMessageAt && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatDistanceToNowStrict(new Date(conv.lastMessageAt), { addSuffix: true })}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-[var(--text-muted)]">{previews[conv.id] ?? "…"}</p>
              <div className="flex items-center gap-1.5">
                {conv.status === "ARCHIVED" && (
                  <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px]">Archived</span>
                )}
                {conv.status === "BLOCKED" && (
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-500">Blocked</span>
                )}
                {conv.unreadCount > 0 && (
                  <span className="rounded-full bg-[var(--color-accent-600)] px-1.5 py-0.5 text-[10px] text-white">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
