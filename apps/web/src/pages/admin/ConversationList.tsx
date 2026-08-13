import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { format } from "date-fns";
import { ChevronDown, Paperclip } from "lucide-react";
import type { AdminConversationSummaryDto, ServerWsEvent } from "@anonchat/shared";

/** Sentinel stored in `previews` for an attachment-only last message, so the
 *  render can show a real Paperclip icon instead of baking one into the string. */
const ATTACHMENT_PREVIEW = "__ATTACHMENT_PREVIEW__";
import {
  archiveConversation,
  blockConversation,
  listConversations,
  muteConversation,
  softDeleteConversation,
  unarchiveConversation,
  unblockConversation,
  unmuteConversation,
} from "../../api/admin.js";
import { decryptMessageText, getConversationKey } from "../../crypto/conversationCrypto.js";
import { getAdminMessages } from "../../api/admin.js";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket.js";
import {
  setConversationMutedLocally,
  syncMutedConversationIds,
} from "./mutedConversations.js";

type StatusFilter = "ALL" | "UNREAD" | "READ" | "ARCHIVED" | "BLOCKED";

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

/** WhatsApp-style compact timestamp: clock time today, "MMM d" otherwise. */
function formatMessageTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString() ? format(d, "p") : format(d, "MMM d");
}

export function ConversationList({ selectedId, onSelect, refreshToken }: Props) {
  const { identity } = useAdminSession();
  const [conversations, setConversations] = useState<AdminConversationSummaryDto[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveToken, setLiveToken] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Keep the muted-conversation registry (used by GlobalNotifications) in
  // sync with whatever the list currently knows.
  useEffect(() => {
    syncMutedConversationIds(conversations.filter((c) => c.mutedAt).map((c) => c.id));
  }, [conversations]);

  // Close the row dropdown on any outside click.
  useEffect(() => {
    if (!openMenuId) return;
    function handleDown(e: MouseEvent) {
      if (!(e.target as Element | null)?.closest("[data-row-menu]")) setOpenMenuId(null);
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [openMenuId]);

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

  async function runRowAction(conv: AdminConversationSummaryDto, action: string) {
    setOpenMenuId(null);
    try {
      switch (action) {
        case "archive":
          if (conv.status === "ARCHIVED") await unarchiveConversation(conv.id);
          else await archiveConversation(conv.id);
          break;
        case "block":
          if (conv.status === "BLOCKED") await unblockConversation(conv.id);
          else await blockConversation(conv.id);
          break;
        case "mute": {
          const next = !conv.mutedAt;
          if (next) await muteConversation(conv.id);
          else await unmuteConversation(conv.id);
          // Local registry first so a message racing the list refetch
          // doesn't slip through as a notification.
          setConversationMutedLocally(conv.id, next);
          break;
        }
        case "delete":
          if (!confirm("Move this conversation to trash?")) return;
          await softDeleteConversation(conv.id);
          break;
      }
    } catch {
      // best-effort: the list refetch below will show the unchanged state
    }
    setLiveToken((n) => n + 1);
  }

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
                "rounded-full px-2.5 py-1 text-xs transition-colors",
                filter === f.value
                  ? "bg-[var(--btn-bg)] text-[var(--btn-fg)]"
                  : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text)]",
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
          conversations.map((conv) => {
            const unread = conv.unreadCount > 0;
            return (
              <div key={conv.id} className="group relative border-b border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className={clsx(
                    "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors",
                    selectedId === conv.id ? "bg-[var(--selected-bg)]" : "hover:bg-[var(--surface-muted)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={clsx(
                        "flex min-w-0 items-center truncate text-sm",
                        unread ? "font-semibold" : "font-normal",
                      )}
                    >
                      {conv.adminAlias || `Anonymous #${conv.publicId}`}
                    </span>
                    {conv.lastMessageAt && (
                      <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                        {formatMessageTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div
                    className={clsx(
                      "flex min-w-0 items-center gap-1.5 text-xs",
                      unread ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      {previews[conv.id] === ATTACHMENT_PREVIEW ? (
                        <>
                          <Paperclip size={11} className="shrink-0" aria-hidden />
                          Attachment
                        </>
                      ) : (
                        (previews[conv.id] ?? "…")
                      )}
                    </span>
                    {/* Right side, below the time (same anchor): the chevron
                        action trigger sits in the gap between the preview
                        text and the unread badge, and the badge is pinned to
                        the far right. The chevron's slot is always reserved
                        (invisible when hidden, never display:none) so
                        revealing it on hover cannot move the text. */}
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      {unread && (
                        <span
                          className={clsx(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                            conv.mutedAt
                              ? "bg-[var(--surface-muted)] text-[var(--text-muted)]"
                              : "bg-[var(--btn-bg)] text-[var(--btn-fg)]",
                          )}
                        >
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </span>
                      )}
                      {/* The chevron keeps the far-right slot: its space is
                          always reserved (visibility toggling, never display)
                          so the badge simply sits left of it and nothing
                          moves when the chevron reveals on hover. */}
                      <div data-row-menu className="relative">
                        <button
                          type="button"
                          aria-label="Conversation actions"
                          aria-expanded={openMenuId === conv.id}
                          onClick={() => setOpenMenuId(openMenuId === conv.id ? null : conv.id)}
                          className={clsx(
                            "rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]",
                            openMenuId === conv.id
                              ? "visible"
                              : "visible md:invisible md:group-hover:visible md:group-focus-within:visible",
                          )}
                        >
                          <ChevronDown size={16} aria-hidden />
                        </button>
                        {openMenuId === conv.id && (
                          <div
                            role="menu"
                            className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] py-1 shadow-lg"
                          >
                            <RowMenuItem onClick={() => runRowAction(conv, "archive")}>
                              {conv.status === "ARCHIVED" ? "Unarchive" : "Archive"}
                            </RowMenuItem>
                            <RowMenuItem onClick={() => runRowAction(conv, "block")}>
                              {conv.status === "BLOCKED" ? "Unblock" : "Block"}
                            </RowMenuItem>
                            <RowMenuItem onClick={() => runRowAction(conv, "mute")}>
                              {conv.mutedAt ? "Unmute" : "Mute"}
                            </RowMenuItem>
                            <div className="my-1 h-px bg-[var(--border)]" role="separator" />
                            <RowMenuItem destructive onClick={() => runRowAction(conv, "delete")}>
                              Delete
                            </RowMenuItem>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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
                    {conv.mutedAt && (
                      <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        Muted
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RowMenuItem({
  children,
  destructive = false,
  onClick,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={clsx(
        "block w-full px-3 py-1.5 text-left text-sm transition-colors",
        destructive
          ? "text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]"
          : "hover:bg-[var(--surface-muted)]",
      )}
    >
      {children}
    </button>
  );
}
