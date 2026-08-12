import type { SocketStatus } from "../../hooks/useRealtimeSocket.js";

export function ConnectionBanner({ status }: { status: SocketStatus }) {
  if (status === "open") return null;
  return (
    <div className="bg-[var(--warning-bg)] px-3 py-1.5 text-center text-xs text-[var(--warning-fg)]" role="status">
      {status === "connecting" ? "Reconnecting…" : "Connection lost. Retrying…"}
    </div>
  );
}
