import type { SocketStatus } from "../../hooks/useRealtimeSocket.js";

export function ConnectionBanner({ status }: { status: SocketStatus }) {
  if (status === "open") return null;
  return (
    <div className="bg-amber-500/15 px-3 py-1.5 text-center text-xs text-amber-600 dark:text-amber-400" role="status">
      {status === "connecting" ? "Reconnecting…" : "Connection lost. Retrying…"}
    </div>
  );
}
