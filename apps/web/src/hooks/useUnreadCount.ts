import { useCallback, useEffect, useState } from "react";
import type { ServerWsEvent } from "@anonchat/shared";
import { listConversations } from "../api/admin.js";
import { useRealtimeSocket } from "./useRealtimeSocket.js";

/**
 * Conversations with at least one unread message, kept live via the admin's
 * WebSocket feed. Powers the Inbox nav badge so a new message is visible
 * from any admin page, not just while already looking at the inbox - the
 * only other signal (a sound + an OS notification that skips a focused tab)
 * gave no cue at all if the admin was on Settings/Sessions/etc.
 */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    listConversations({ status: "UNREAD" })
      .then((res) => setCount(res.conversations.length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleEvent = useCallback(
    (event: ServerWsEvent) => {
      if (
        event.type === "message.created" ||
        event.type === "conversation.read" ||
        event.type === "conversation.updated"
      ) {
        refresh();
      }
    },
    [refresh],
  );
  useRealtimeSocket(handleEvent, true, refresh);

  return count;
}
