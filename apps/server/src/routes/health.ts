import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch {
      reply.status(503);
      return { status: "not-ready" };
    }
  });
}
