import type { ServerWsEvent } from "@anonchat/shared";
import type { WebSocket } from "ws";

/**
 * In-process pub/sub for real-time delivery. Correct and sufficient for the
 * default single-instance deployment - see docs/ARCHITECTURE.md "Why no
 * Redis". A horizontally-scaled deployment would swap this module for a
 * Redis (or similar) backed adapter without touching call sites.
 */
const conversationSubscribers = new Map<string, Set<WebSocket>>();
const adminSockets = new Set<WebSocket>();

function send(socket: WebSocket, event: ServerWsEvent): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

export function subscribeToConversation(conversationId: string, socket: WebSocket): () => void {
  let set = conversationSubscribers.get(conversationId);
  if (!set) {
    set = new Set();
    conversationSubscribers.set(conversationId, set);
  }
  set.add(socket);
  return () => {
    set?.delete(socket);
    if (set && set.size === 0) conversationSubscribers.delete(conversationId);
  };
}

export function subscribeAdmin(socket: WebSocket): () => void {
  adminSockets.add(socket);
  return () => adminSockets.delete(socket);
}

/** Delivered to the conversation's own participant AND every admin socket. */
export function publishToConversation(conversationId: string, event: ServerWsEvent): void {
  const set = conversationSubscribers.get(conversationId);
  if (set) for (const socket of set) send(socket, event);
  for (const socket of adminSockets) send(socket, event);
}

export function publishToAdmins(event: ServerWsEvent): void {
  for (const socket of adminSockets) send(socket, event);
}

/** Used for presence broadcast - every currently-connected anonymous user. */
export function publishToAllAnonymousUsers(event: ServerWsEvent): void {
  for (const set of conversationSubscribers.values()) {
    for (const socket of set) send(socket, event);
  }
}

export function isAdminOnline(): boolean {
  return adminSockets.size > 0;
}
