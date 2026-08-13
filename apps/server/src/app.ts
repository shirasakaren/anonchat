import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import websocketPlugin from "@fastify/websocket";
import { MAX_CIPHERTEXT_ENVELOPE_BYTES } from "@anonchat/shared";
import authPlugin from "./auth/plugin.js";
import { corsOrigins, loadEnv } from "./env.js";
import { buildLoggerOptions } from "./logger.js";
import { registerWsRoutes } from "./realtime/wsRoutes.js";
import { registerAdminAuthRoutes } from "./routes/admin/auth.js";
import { registerAuditLogRoutes } from "./routes/admin/auditLog.js";
import { registerCannedReplyRoutes } from "./routes/admin/cannedReplies.js";
import { registerAdminConversationRoutes } from "./routes/admin/conversations.js";
import { registerOnboardingRoutes } from "./routes/admin/onboarding.js";
import { registerAdminSettingsRoutes } from "./routes/admin/settings.js";
import { registerAnonymousRoutes } from "./routes/anonymous.js";
import { registerConversationRoutes } from "./routes/conversation.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLinkPreviewRoutes } from "./routes/linkPreview.js";
import { registerSiteRoutes } from "./routes/site.js";
import { ensureCsrfCookie, verifyCsrf } from "./security/csrf.js";
import { handleError } from "./utils/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();

  const app = Fastify({
    logger: buildLoggerOptions(),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_048_576,
  });

  app.setErrorHandler(handleError);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        // Only the two platforms whose embeds this app actually renders as
        // iframes (VideoEmbed.tsx) - a shared link to any other site never
        // gets an inline-playable iframe, only a same-origin-fetched OG
        // preview card (see /api/link-preview), which needed no CSP change
        // at all since the browser only ever talks to this app's own
        // origin for that.
        frameSrc: ["'self'", "https://www.youtube-nocookie.com", "https://player.vimeo.com"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
  });
  await app.register(cors, { origin: corsOrigins(env), credentials: true });
  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_ATTACHMENT_SIZE_MB * 1024 * 1024,
      files: env.MAX_ATTACHMENTS_PER_MESSAGE,
      // Non-file fields on a send-message request: content, replyToId, and
      // one attachmentMeta per attachment - bound these explicitly too, or
      // busboy's unbounded defaults let a client pad a request with huge
      // non-file fields before ever reaching a file part. Must stay >=
      // MAX_CIPHERTEXT_ENVELOPE_BYTES + margin for the JSON wrapper/nonce -
      // it caps the same "content" field's raw string length, and a message
      // sent with an attachment goes through this multipart path rather
      // than the plain-JSON bodyLimit above.
      fields: env.MAX_ATTACHMENTS_PER_MESSAGE + 2,
      fieldSize: MAX_CIPHERTEXT_ENVELOPE_BYTES + 4_096,
      parts: env.MAX_ATTACHMENTS_PER_MESSAGE * 2 + 4,
    },
  });
  await app.register(websocketPlugin);

  registerHealthRoutes(app);

  await app.register(
    async (api) => {
      await api.register(authPlugin);
      api.addHook("preHandler", async (request, reply) => {
        ensureCsrfCookie(request, reply);
        verifyCsrf(request);
      });

      registerSiteRoutes(api);
      registerLinkPreviewRoutes(api);
      registerAnonymousRoutes(api);
      registerConversationRoutes(api);
      registerOnboardingRoutes(api);
      registerAdminAuthRoutes(api);
      registerAdminConversationRoutes(api);
      registerAdminSettingsRoutes(api);
      registerCannedReplyRoutes(api);
      registerAuditLogRoutes(api);
      registerWsRoutes(api);
    },
    { prefix: "/api" },
  );

  if (env.NODE_ENV === "production") {
    // Defaults to the monorepo's dev layout (apps/server/dist -> ../../web/dist);
    // the Docker image sets WEB_DIST_DIR explicitly since its deployed layout differs.
    const webDist = process.env.WEB_DIST_DIR ?? join(__dirname, "../../web/dist");
    await app.register(staticPlugin, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api")) {
        reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found." } });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
