import type { FastifyInstance } from "fastify";
import { IdParamSchema, VisitorInsightConsentRequestSchema } from "@anonchat/shared";
import { requireAdmin, requireAnon } from "../auth/plugin.js";
import { getClientIp } from "../utils/ip.js";
import { Errors } from "../utils/errors.js";
import { recordAudit } from "../services/auditLog.service.js";
import { getConversationForAdmin } from "../services/conversation.service.js";
import {
  getVisitorInsightForConversation,
  getVisitorInsightsStatus,
  revokeVisitorInsights,
  saveVisitorInsights,
} from "../services/visitorInsights.service.js";

export function registerVisitorInsightsRoutes(app: FastifyInstance): void {
  app.get("/anonymous/insights/status", { preHandler: requireAnon }, async (request) =>
    getVisitorInsightsStatus(request.anonUser!.id),
  );

  app.post("/anonymous/insights/consent", { preHandler: requireAnon }, async (request, reply) => {
    const body = VisitorInsightConsentRequestSchema.parse(request.body);
    try {
      await saveVisitorInsights(request.anonUser!.id, getClientIp(request), body);
    } catch (error) {
      if (error instanceof Error && error.message === "VISITOR_INSIGHTS_DISABLED") {
        throw Errors.conflict("Visitor insights are currently disabled.");
      }
      throw error;
    }
    reply.status(204).send();
  });

  app.delete("/anonymous/insights", { preHandler: requireAnon }, async (request, reply) => {
    await revokeVisitorInsights(request.anonUser!.id);
    reply.status(204).send();
  });

  app.get("/admin/conversations/:id/insights", { preHandler: requireAdmin }, async (request) => {
    const { id } = IdParamSchema.parse(request.params);
    const { admin } = request.adminAuth!;
    await getConversationForAdmin(id);
    const insight = await getVisitorInsightForConversation(id);
    await recordAudit(admin.id, "visitor_insights.viewed", { type: "Conversation", id });
    return { insight };
  });
}
