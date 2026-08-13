import { useCallback } from "react";
import type { ServerWsEvent } from "@anonchat/shared";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket.js";
import { useAdminNotifications } from "../../hooks/useAdminNotifications.js";
import { useTheme } from "../../context/ThemeContext.js";
import { isConversationMuted } from "./mutedConversations.js";

/**
 * Mounted once at the AdminApp level (not inside Inbox) so a new-message
 * notification fires no matter which admin page is currently open, and
 * doesn't depend on a specific conversation being selected. Also the one
 * place that picks up a theme change pushed from another admin session/tab.
 */
export function GlobalNotifications() {
  const { notify } = useAdminNotifications();
  const { syncFromServer } = useTheme();

  const handleEvent = useCallback(
    (event: ServerWsEvent) => {
      if (event.type === "message.created" && event.message.senderType === "USER") {
        // Muted conversations stay quiet (sound AND popup) while their
        // unread counts still accumulate in the inbox.
        if (isConversationMuted(event.conversationId)) return;
        notify("New anonymous message", "You have a new message in your inbox.");
      } else if (event.type === "site.updated") {
        syncFromServer(event.theme);
      }
    },
    [notify, syncFromServer],
  );

  useRealtimeSocket(handleEvent, true);
  return null;
}
