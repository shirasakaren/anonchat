import { useCallback } from "react";
import type { ServerWsEvent } from "@anonchat/shared";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket.js";
import { useAdminNotifications } from "../../hooks/useAdminNotifications.js";

/**
 * Mounted once at the AdminApp level (not inside Inbox) so a new-message
 * notification fires no matter which admin page is currently open, and
 * doesn't depend on a specific conversation being selected.
 */
export function GlobalNotifications() {
  const { notify } = useAdminNotifications();

  const handleEvent = useCallback(
    (event: ServerWsEvent) => {
      if (event.type === "message.created" && event.message.senderType === "USER") {
        notify("New anonymous message", "You have a new message in your inbox.");
      }
    },
    [notify],
  );

  useRealtimeSocket(handleEvent, true);
  return null;
}
