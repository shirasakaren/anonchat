import type { FastifyInstance } from "fastify";
import { PushSubscriptionRequestSchema, PushUnsubscribeRequestSchema } from "@anonchat/shared";
import { requireAdmin } from "../../auth/plugin.js";
import { prisma } from "../../db.js";

export function registerAdminPushRoutes(app: FastifyInstance): void {
  app.post("/admin/push/subscribe", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const body = PushSubscriptionRequestSchema.parse(request.body);
    // Preserve anonymous ownership when the same browser is used for both
    // sides. PushManager exposes one subscription per origin, so clearing
    // the other FK would silently disable visitor pushes.
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        adminId: admin.id,
        anonymousUserId: null,
      },
      update: { p256dh: body.keys.p256dh, auth: body.keys.auth, adminId: admin.id },
    });
    reply.status(204).send();
  });

  app.post("/admin/push/unsubscribe", { preHandler: requireAdmin }, async (request, reply) => {
    const { admin } = request.adminAuth!;
    const { endpoint } = PushUnsubscribeRequestSchema.parse(request.body);
    const subscription = await prisma.pushSubscription.findFirst({ where: { endpoint, adminId: admin.id } });
    let unsubscribeBrowser = true;
    if (subscription) {
      if (subscription.anonymousUserId) {
        await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { adminId: null } });
        unsubscribeBrowser = false;
      } else {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } });
      }
    }
    reply.send({ unsubscribeBrowser });
  });
}
