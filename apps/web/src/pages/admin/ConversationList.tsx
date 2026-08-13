import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { Paperclip } from "lucide-react";
import type { AdminConversationSummaryDto, ServerWsEvent } from "@anonchat/shared";

/** Sentinel stored in `previews` for an attachment-only last message, so the
 *  render can show a real Paperclip icon instead of baking one into the string. */
const ATTACHMENT_PREVIEW = "__ATTACHMENT_PREVIEW__";
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

  // Filter/search changes are the only case where there's genuinely nothing
  // to show yet, so only they show the "Loading…" placeholder.
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
  }, [filter, search]);

  // A new/updated message just needs the list refreshed in the background -
  // blanking it to "Loading…" on every send/receive is what produced the
  // flicker. Skip the initial mount (the effect above already covers it):
  // refreshToken/liveToken are monotonically-increasing counters that start
  // at 0, so this only does real work once either has actually bumped.
  useEffect(() => {
    if (refreshToken === 0 && liveToken === 0) return;
    let cancelled = false;
    listConversations({ status: filter, q: search || undefined }).then((res) => {
      if (!cancelled) setConversations(res.conversations);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, liveToken]);

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
          else if (last) updates[conv.id] = ATTACHMENT_PREVIEW;
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
    <div className="flex h-full w-full flex-col border-r border-[var(--border)] md:w-80">
      <h1 className="sr-only">Inbox</h1>
      <div className="border-b border-[var(--border)] p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID or nickname…"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-1.5 text-sm"
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
                  ? "bg-[var(--btn-bg)] text-[var(--btn-fg)]"
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
                selectedId === conv.id ? "bg-[var(--selected-bg)]" : "hover:bg-[var(--surface-muted)]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span
                    className={clsx(
                      "h-2 w-2 shrink-0 rounded-full",
                      conv.unreadCount > 0 ? "bg-[var(--color-accent-500)]" : "bg-transparent",
                    )}
                  />
                  <span className="truncate">{conv.adminAlias || `Anonymous #${conv.publicId}`}</span>
                  {conv.adminAlias && (
                    <span className="shrink-0 text-[11px] font-normal text-[var(--text-muted)]">
                      #{conv.publicId}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-xs text-[var(--text-muted)]">
                  {conv.lastMessageAt
                    ? formatDistanceToNowStrict(new Date(conv.lastMessageAt), { addSuffix: true })
                    : `Started ${formatDistanceToNowStrict(new Date(conv.createdAt), { addSuffix: true })}`}
                </span>
              </div>
              <p className="flex items-center gap-1 truncate text-xs text-[var(--text-muted)]">
                {previews[conv.id] === ATTACHMENT_PREVIEW ? (
                  <>
                    <Paperclip size={11} className="shrink-0" aria-hidden />
                    Attachment
                  </>
                ) : (
                  (previews[conv.id] ?? "…")
                )}
              </p>
              <div className="flex items-center gap-1.5">
                {conv.status === "ARCHIVED" && (
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                    Archived
                  </span>
                )}
                {conv.status === "BLOCKED" && (
                  <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 text-xs text-[var(--danger-fg)]">
                    Blocked
                  </span>
                )}
                {conv.unreadCount > 0 && (
                  <span className="rounded-full bg-[var(--btn-bg)] px-1.5 py-0.5 text-xs text-[var(--btn-fg)]">
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
