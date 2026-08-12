import type { FastifyInstance } from "fastify";
import { CannedReplyRequestSchema, IdParamSchema, type CannedReplyDto } from "@anonchat/shared";
import { requireAdmin } from "../../auth/plugin.js";
import { prisma } from "../../db.js";
import { Errors } from "../../utils/errors.js";

function toDto(reply: { id: string; title: string; body: string; createdAt: Date; updatedAt: Date }): CannedReplyDto {
  return {
    id: reply.id,
    title: reply.title,
    body: reply.body,
    createdAt: reply.createdAt.toISOString(),
    updatedAt: reply.updatedAt.toISOString(),
  };
}

export function registerCannedReplyRoutes(app: FastifyInstance): void {
  app.get("/admin/canned-replies", { preHandler: requireAdmin }, async (request) => {
    const { admin } = request.adminAuth!;
    const replies = await prisma.cannedReply.findMany({ where: { adminId: admin.id }, orderBy: { title: "asc" } });
    return replies.map(toDto);
  });

  app.post("/admin/canned-replies", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const body = CannedReplyRequestSchema.parse(request.body);
    const created = await prisma.cannedReply.create({
      data: { adminId: admin.id, title: body.title, body: body.body },
    });
    reply.status(201).send(toDto(created));
  });

  app.patch("/admin/canned-replies/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = IdParamSchema.parse(request.params);
    const body = CannedReplyRequestSchema.parse(request.body);
    const existing = await prisma.cannedReply.findFirst({ where: { id: params.id, adminId: admin.id } });
    if (!existing) throw Errors.notFound();
    const updated = await prisma.cannedReply.update({
      where: { id: params.id },
      data: { title: body.title, body: body.body },
    });
    reply.send(toDto(updated));
  });

  app.delete("/admin/canned-replies/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const params = IdParamSchema.parse(request.params);
    const result = await prisma.cannedReply.deleteMany({ where: { id: params.id, adminId: admin.id } });
    if (result.count === 0) throw Errors.notFound();
    reply.status(204).send();
  });
}
