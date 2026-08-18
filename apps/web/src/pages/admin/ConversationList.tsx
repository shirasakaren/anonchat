import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { format } from "date-fns";
import { Archive, CheckSquare, ChevronDown, Square } from "lucide-react";
import type { AdminConversationSummaryDto, ServerWsEvent } from "@anonchat/shared";
import {
  archiveConversation,
  blockConversation,
  bulkConversationAction,
  listConversations,
  muteConversation,
  softDeleteConversation,
  unarchiveConversation,
  unblockConversation,
  unmuteConversation,
} from "../../api/admin.js";
import { useToast } from "../../context/ToastContext.js";
import {
  decryptAttachmentMeta,
  decryptMessageTextWithStatus,
  getConversationKey,
} from "../../crypto/conversationCrypto.js";
import { getAdminMessages } from "../../api/admin.js";
import { useAdminSession } from "../../context/AdminSessionContext.js";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket.js";
import { setConversationMutedLocally, syncMutedConversationIds } from "./mutedConversations.js";
import { IconForMime } from "../../components/chat/AttachmentPreview.js";

/** A caption-less attachment (the common case - "send a photo" rarely comes
 *  with typed text) still has non-null ciphertext content: the composer
 *  always encrypts `text`, even when it's "". Decrypting that gives back an
 *  empty string, which used to render as a blank preview line - indistin-
 *  guishable from "no preview yet" and never showing what was actually
 *  sent. `kind` distinguishes that case so the row can show a real
 *  type-specific icon + label instead. */
type PreviewState =
  { kind: "text"; text: string } | { kind: "deleted" } | { kind: "attachment"; mimetype: string; filename: string };

/** Coarse category label to sit next to the icon - GIF called out
 *  specifically (not lumped into "Photo") since it's visually distinct and
 *  the most common non-still-image attachment. */
function attachmentLabel(mimetype: string): string {
  if (mimetype === "image/gif") return "GIF";
  if (mimetype.startsWith("image/")) return "Photo";
  if (mimetype.startsWith("video/")) return "Video";
  if (mimetype.startsWith("audio/")) return "Audio";
  return "File";
}

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
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<AdminConversationSummaryDto[]>([]);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveToken, setLiveToken] = useState(0);
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  // Bulk-selection mode: checkboxes appear on each row, a "select all"
  // control and Archive/Block/Delete actions replace the ordinary row
  // actions until the mode is cancelled.
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Keep the muted-conversation registry (used by GlobalNotifications) in
  // sync with whatever the list currently knows.
  useEffect(() => {
    syncMutedConversationIds(conversations.filter((c) => c.mutedAt).map((c) => c.id));
  }, [conversations]);

  // Close the row dropdown on any outside click.
  useEffect(() => {
    if (!openMenu) return;
    function handleDown(e: MouseEvent) {
      if (!(e.target as Element | null)?.closest("[data-row-menu]")) setOpenMenu(null);
    }
    function closeMenu() {
      setOpenMenu(null);
    }
    document.addEventListener("mousedown", handleDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openMenu]);

  // Filter/search changes are the only case where there's genuinely nothing
  // to show yet, so only they show the "Loading…" placeholder.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listConversations({ status: filter, q: search || undefined })
      .then((res) => {
        if (cancelled) return;
        setConversations(res.conversations);
      })
      .catch(() => {
        if (!cancelled) setConversations([]);
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
    void listConversations({ status: filter, q: search || undefined })
      .then((res) => {
        if (!cancelled) setConversations(res.conversations);
      })
      .catch(() => {});
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
    } else if (event.type === "conversation.updated" || event.type === "conversation.read") {
      // conversation.read fires when ConversationView marks messages read
      // (e.g. the admin just opened this chat) - without refetching here,
      // the row's unreadCount/badge only updates on the next unrelated
      // list refresh, so it visibly persists until a manual reload even
      // though the server already cleared it.
      setLiveToken((n) => n + 1);
    }
  }, []);
  useRealtimeSocket(handleLiveEvent, true);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    void (async () => {
      const updates: Record<string, PreviewState> = {};
      for (const conv of conversations) {
        if (previews[conv.id]) continue;
        try {
          const key = getConversationKey(identity, conv.anonymousExchangePublicKey, conv.id);
          // Only the newest message is needed for the preview - fetching a
          // full oldest-first page and reading its tail showed a stale
          // preview forever once a conversation outgrew one page.
          const page = await getAdminMessages(conv.id, undefined, true);
          const last = page.messages[0];
          if (!last) continue;
          if (last.deleted) {
            updates[conv.id] = { kind: "deleted" };
            continue;
          }
          // content is non-null (and decrypts to "") for an attachment-only
          // message too - the composer always encrypts `text`, even empty -
          // so an empty decrypt only means "no caption", not "no preview".
          const decrypted = last.content ? decryptMessageTextWithStatus(key, last.content) : null;
          const text = decrypted?.text ?? "";
          const firstAttachment = last.attachments[0];
          if (decrypted?.error) {
            updates[conv.id] = { kind: "text", text: "Encrypted message unavailable" };
          } else if (text.trim()) {
            updates[conv.id] = { kind: "text", text };
          } else if (firstAttachment) {
            const meta = decryptAttachmentMeta(key, firstAttachment.meta);
            updates[conv.id] = {
              kind: "attachment",
              mimetype: meta?.mimetype ?? "application/octet-stream",
              filename: meta?.filename ?? "",
            };
          } else {
            updates[conv.id] = { kind: "text", text: "" };
          }
        } catch {
          updates[conv.id] = { kind: "text", text: "" };
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

  function toggleBulkMode() {
    setBulkMode((on) => !on);
    setSelectedIds(new Set());
    setOpenMenu(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      if (prev.size === conversations.length && conversations.length > 0) return new Set();
      return new Set(conversations.map((c) => c.id));
    });
  }

  async function runBulkAction(action: "archive" | "delete" | "block" | "unarchive" | "unblock") {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      await bulkConversationAction(ids, action);
      setSelectedIds(new Set());
      setBulkMode(false);
      setLiveToken((n) => n + 1);
      const label = {
        archive: "archived",
        unarchive: "unarchived",
        delete: "moved to trash",
        block: "blocked",
        unblock: "unblocked",
      }[action];
      showToast({
        title: `${ids.length} ${ids.length === 1 ? "conversation" : "conversations"} ${label}`,
        message: "",
        tone: "success",
      });
    } catch (error) {
      showToast({
        title: "Bulk action failed",
        message: error instanceof Error ? error.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  async function runRowAction(conv: AdminConversationSummaryDto, action: string) {
    setOpenMenu(null);
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
          placeholder="Search by ID, visitor name, or nickname…"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-1.5 text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1">
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

      {/* Select mode lives behind each row's dropdown ("Select" in the
          chevron menu), not in the filter bar. The bar below shows the
          running selection and the bulk actions, with Cancel in line with
          Archive / Block / Delete. Archive and Block flip to Unarchive /
          Unblock when EVERY selected conversation already carries that
          status, so the button always performs the visible action. */}
      {bulkMode && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <button
            type="button"
            onClick={selectAllVisible}
            aria-pressed={selectedIds.size === conversations.length && conversations.length > 0}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-[var(--surface-muted)]"
          >
            {selectedIds.size === conversations.length && conversations.length > 0 ? (
              <CheckSquare size={14} aria-hidden />
            ) : (
              <Square size={14} aria-hidden />
            )}
            {selectedIds.size === conversations.length && conversations.length > 0
              ? `Clear selection (${selectedIds.size} selected)`
              : `Select all (${selectedIds.size} selected)`}
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {(() => {
              const selected = conversations.filter((c) => selectedIds.has(c.id));
              const allArchived = selected.length > 0 && selected.every((c) => c.status === "ARCHIVED");
              const allBlocked = selected.length > 0 && selected.every((c) => c.status === "BLOCKED");
              return (
                <>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || bulkBusy}
                    onClick={() => void runBulkAction(allArchived ? "unarchive" : "archive")}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--surface-muted)] disabled:opacity-40"
                  >
                    <Archive size={13} aria-hidden />
                    {allArchived ? "Unarchive" : "Archive"}
                  </button>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || bulkBusy}
                    onClick={() => void runBulkAction(allBlocked ? "unblock" : "block")}
                    className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--surface-muted)] disabled:opacity-40"
                  >
                    {allBlocked ? "Unblock" : "Block"}
                  </button>
                </>
              );
            })()}
            <button
              type="button"
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => {
                if (
                  confirm(
                    `Move ${selectedIds.size} selected ${selectedIds.size === 1 ? "conversation" : "conversations"} to trash?`,
                  )
                ) {
                  void runBulkAction("delete");
                }
              }}
              className="rounded-md bg-red-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={toggleBulkMode}
              className="rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:bg-[var(--surface-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={bulkMode ? selectedIds.has(conv.id) : undefined}
                  onClick={() => (bulkMode ? toggleSelected(conv.id) : onSelect(conv.id))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (bulkMode) toggleSelected(conv.id);
                      else onSelect(conv.id);
                    }
                  }}
                  className={clsx(
                    "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors",
                    // The selected row keeps its accent tint on hover instead
                    // of swapping to the generic highlight.
                    selectedId === conv.id ? "bg-[var(--selected-bg)]" : "hover:bg-[var(--row-hover)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={clsx(
                        "flex min-w-0 items-center gap-1.5 truncate text-sm",
                        unread ? "font-semibold" : "font-normal",
                      )}
                    >
                      {/* In selection mode the checkbox sits on the sender's
                          name line (not vertically centered against the
                          whole row), and the preview line below indents by
                          the same amount so name and preview stay aligned. */}
                      {bulkMode && (
                        <span
                          aria-hidden
                          className={clsx(
                            "shrink-0",
                            selectedIds.has(conv.id) ? "text-[var(--link-fg)]" : "text-[var(--text-muted)]",
                          )}
                        >
                          {selectedIds.has(conv.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </span>
                      )}
                      <span className="min-w-0 truncate">
                        {conv.adminAlias || conv.anonymousDisplayName || `Anonymous #${conv.publicId}`}
                      </span>
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
                      bulkMode && "pl-[22px]",
                      unread ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]",
                    )}
                  >
                    {/* min-w-0 + flex-1 (not the trailing side) is what
                        actually reserves the chevron's space: text-overflow
                        ellipsis also requires a non-flex box to act on, so
                        the truncating text itself is a plain span, not
                        `flex`. Growing this element (instead of `ml-auto` on
                        the trailing side) means the badge+chevron cluster's
                        width - which changes depending on whether the badge
                        is rendered - always comes out of this span's budget,
                        never the other way around; the previous `ml-auto`
                        approach let that cluster collapse to zero width
                        whenever `unread` was false (its only child was
                        `absolute`, so it contributed nothing in-flow), which
                        let a long preview run its full text under the
                        always-absolutely-positioned chevron button. */}
                    <span className="min-w-0 flex-1 truncate">
                      {(() => {
                        const preview = previews[conv.id];
                        if (!preview) return "…";
                        if (preview.kind === "deleted") return "Message deleted";
                        if (preview.kind === "attachment") {
                          return (
                            <span className="inline-flex items-center gap-1 align-middle">
                              <IconForMime mimetype={preview.mimetype} filename={preview.filename} size={11} />
                              {attachmentLabel(preview.mimetype)}
                            </span>
                          );
                        }
                        return preview.text || "…";
                      })()}
                    </span>
                    {/* Right side, below the time: badge and chevron are now
                        ordinary in-flow flex siblings (not absolutely
                        positioned), so this cluster's real width is always
                        subtracted from the preview span's budget above,
                        whether or not the badge is currently rendered. The
                        chevron button keeps its slot reserved even while
                        `invisible` (never `display:none`), so revealing it
                        on hover can't shift anything else in the row. */}
                    <div className="flex h-6 shrink-0 items-center gap-1">
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
                      <div data-row-menu className={clsx("relative shrink-0", bulkMode && "hidden")}>
                        <button
                          type="button"
                          aria-label="Conversation actions"
                          aria-expanded={openMenu?.id === conv.id}
                          onClick={(e) => {
                            // The chevron sits inside the row's open-chat
                            // button - stop the click from bubbling up so
                            // opening the menu never navigates into the chat.
                            e.stopPropagation();
                            if (openMenu?.id === conv.id) {
                              setOpenMenu(null);
                              return;
                            }
                            const rect = e.currentTarget.getBoundingClientRect();
                            const width = 160;
                            const estimatedHeight = 158;
                            setOpenMenu({
                              id: conv.id,
                              left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
                              top:
                                rect.bottom + 4 + estimatedHeight <= window.innerHeight
                                  ? rect.bottom + 4
                                  : Math.max(8, rect.top - estimatedHeight - 4),
                            });
                          }}
                          className={clsx(
                            "rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]",
                            openMenu?.id === conv.id
                              ? "visible"
                              : "visible md:invisible md:group-hover:visible md:group-focus-within:visible",
                          )}
                        >
                          <ChevronDown size={16} aria-hidden />
                        </button>
                        {openMenu?.id === conv.id &&
                          createPortal(
                            <div
                              data-row-menu
                              role="menu"
                              onClick={(e) => e.stopPropagation()}
                              className="fixed z-[100] w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] py-1 shadow-xl"
                              style={{ top: openMenu.top, left: openMenu.left }}
                            >
                              <RowMenuItem
                                icon={<CheckSquare size={14} aria-hidden />}
                                onClick={() => {
                                  // "Select" starts selection mode with this
                                  // conversation already checked.
                                  setOpenMenu(null);
                                  setBulkMode(true);
                                  setSelectedIds(new Set([conv.id]));
                                }}
                              >
                                Select
                              </RowMenuItem>
                              <div className="my-1 h-px bg-[var(--border)]" role="separator" />
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
                            </div>,
                            document.body,
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
                </div>
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
  icon,
  onClick,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
        destructive ? "text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]" : "hover:bg-[var(--surface-muted)]",
      )}
    >
      {icon && <span className="shrink-0 opacity-70">{icon}</span>}
      {children}
    </button>
  );
}
