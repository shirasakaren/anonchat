import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientWsMessage, ServerWsEvent } from "@termine/shared";

export type SocketStatus = "connecting" | "open" | "closed";

/**
 * WebSocket is the live-push channel only; the server DB stays the source of
 * truth. On reconnect, callers re-fetch via REST rather than relying on any
 * replay from the socket - see docs/ARCHITECTURE.md.
 */
export function useRealtimeSocket(onEvent: (event: ServerWsEvent) => void, enabled: boolean, onReconnected?: () => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onReconnectedRef = useRef(onReconnected);
  onReconnectedRef.current = onReconnected;

  useEffect(() => {
    if (!enabled) return;
    let closedByUs = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let hasConnectedOnce = false;

    function connect() {
      setStatus("connecting");
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${location.host}/api/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("open");
        retryDelay = 1000;
        if (hasConnectedOnce) onReconnectedRef.current?.();
        hasConnectedOnce = true;
      };
      ws.onmessage = (event) => {
        try {
          onEventRef.current(JSON.parse(event.data as string) as ServerWsEvent);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        setStatus("closed");
        if (!closedByUs) {
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 15_000);
        }
      };
      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      closedByUs = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [enabled]);

  const send = useCallback((message: ClientWsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { status, send };
}
