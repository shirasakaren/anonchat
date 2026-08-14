import { z } from "zod";

/** The shape of a browser's PushSubscription.toJSON() - shared by both the
 *  admin and anonymous-user subscribe routes. */
export const PushSubscriptionRequestSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});
export type PushSubscriptionRequestInput = z.infer<typeof PushSubscriptionRequestSchema>;

export const PushUnsubscribeRequestSchema = z.object({
  endpoint: z.string().url().max(2000),
});
export type PushUnsubscribeRequestInput = z.infer<typeof PushUnsubscribeRequestSchema>;
