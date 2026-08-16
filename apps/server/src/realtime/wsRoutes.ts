import type { FastifyInstance } from "fastify";
import type { RawData } from "ws";
import { ClientWsMessageSchema } from "@anonchat/shared";
import { corsOrigins, loadEnv } from "../env.js";
import { getSiteSettings } from "../services/siteSettings.service.js";
import { scheduleDisconnectPurge } from "../services/retention.service.js";
import {
  isAdminOnline,
  isUserOnline,
  publishToAdmins,
  publishToAllAnonymousUsers,
  publishToConversation,
  subscribeAdmin,
  subscribeToConversation,
} from "./hub.js";

export function registerWsRoutes(fastify: FastifyInstance): void {
  fastify.get("/ws", { websocket: true }, async (socket, request) => {
    // The WS handshake is a GET request the CSRF double-submit check
    // deliberately skips (it's a "safe" method) - the session cookie is
    // SameSite=Lax, which modern browsers already withhold from a
    // cross-site `new WebSocket(...)` call, but an explicit Origin
    // allowlist here is cheap, unambiguous defense-in-depth against
    // cross-site WebSocket hijacking regardless of cookie/browser quirks.
    const origin = request.headers.origin;
    if (origin && !corsOrigins(loadEnv()).includes(origin)) {
      socket.close(4003, "Forbidden origin");
      return;
    }

    if (request.adminAuth) {
      const wasOnline = isAdminOnline();
      const unsubscribe = subscribeAdmin(socket);
      socket.send(JSON.stringify({ type: "connected" }));

      const settings = await getSiteSettings();
      if (!wasOnline && settings.presenceEnabled) {
        publishToAllAnonymousUsers({ type: "presence", who: "ADMIN", online: true });
      }

      socket.on("message", (raw) => {
        const parsed = safeParseClientMessage(rawMessageToString(raw));
        if (!parsed) return;
        if (parsed.type === "typing.start" || parsed.type === "typing.stop") {
          if (!parsed.conversationId) return;
          publishToConversation(parsed.conversationId, {
            type: "typing",
            conversationId: parsed.conversationId,
            from: "ADMIN",
            isTyping: parsed.type === "typing.start",
          });
        }
      });

      socket.on("close", () => {
        unsubscribe();
        if (!isAdminOnline() && settings.presenceEnabled) {
          publishToAllAnonymousUsers({ type: "presence", who: "ADMIN", online: false });
        }
      });
      return;
    }

    const conversation = request.anonUser?.conversation;
    if (!request.anonUser || !conversation || conversation.status === "BLOCKED") {
      socket.close(4001, "Unauthorized");
      return;
    }

    const wasOnline = isUserOnline(conversation.id);
    const unsubscribe = subscribeToConversation(conversation.id, socket);
    socket.send(JSON.stringify({ type: "connected" }));

    // First socket for this conversation flips the user's presence to
    // online for every connected admin; the mirror image happens on close.
    if (!wasOnline) {
      publishToAdmins({ type: "user.presence", conversationId: conversation.id, online: true });
    }

    const settings = await getSiteSettings();
    if (settings.presenceEnabled) {
      socket.send(JSON.stringify({ type: "presence", who: "ADMIN", online: isAdminOnline() }));
    }

    socket.on("message", (raw) => {
      const parsed = safeParseClientMessage(rawMessageToString(raw));
      if (!parsed) return;
      if (parsed.type === "typing.start" || parsed.type === "typing.stop") {
        publishToConversation(conversation.id, {
          type: "typing",
          conversationId: conversation.id,
          from: "USER",
          isTyping: parsed.type === "typing.start",
        });
      }
    });

    socket.on("close", () => {
      unsubscribe();
      if (!isUserOnline(conversation.id)) {
        publishToAdmins({ type: "user.presence", conversationId: conversation.id, online: false });
        // Auto-delete mode "when the session disconnects": schedule a
        // purge that cancels itself if the visitor reconnects in time.
        if (conversation.autoDeleteMode === "DISCONNECT") {
          scheduleDisconnectPurge(conversation.id);
        }
      }
    });
  });
}

function rawMessageToString(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);
  return raw.toString("utf8");
}

function safeParseClientMessage(raw: string) {
  try {
    const json: unknown = JSON.parse(raw);
    const result = ClientWsMessageSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
