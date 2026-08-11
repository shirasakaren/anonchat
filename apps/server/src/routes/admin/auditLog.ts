import type { FastifyInstance } from "fastify";
import { PaginationQuerySchema } from "@termine/shared";
import { requireAdmin } from "../../auth/plugin.js";
import { listAuditLog } from "../../services/auditLog.service.js";

export function registerAuditLogRoutes(app: FastifyInstance): void {
  app.get("/admin/audit-log", { preHandler: requireAdmin }, async (request) => {
    const query = PaginationQuerySchema.parse(request.query);
    return listAuditLog(query);
  });
}
