import { z } from "zod";
import { Base64UrlSchema, PublicIdSchema, PublicKeysSchema } from "./common.js";

export const RegisterRequestSchema = z.object({
  signingPublicKey: Base64UrlSchema.max(64),
  exchangePublicKey: Base64UrlSchema.max(64),
  proof: Base64UrlSchema.max(256),
});
export type RegisterRequestInput = z.infer<typeof RegisterRequestSchema>;

export const ChallengeRequestSchema = z.object({
  publicId: PublicIdSchema,
});
export type ChallengeRequestInput = z.infer<typeof ChallengeRequestSchema>;

export const RecoverRequestSchema = z.object({
  publicId: PublicIdSchema,
  challengeId: z.string().min(1).max(128),
  signature: Base64UrlSchema.max(256),
});
export type RecoverRequestInput = z.infer<typeof RecoverRequestSchema>;

/** Opt-in "email me when there's a reply" - see docs/SECURITY.md. "" clears it. */
export const NotificationEmailRequestSchema = z.object({
  email: z.union([z.literal(""), z.string().email().max(320)]),
});
export type NotificationEmailRequestInput = z.infer<typeof NotificationEmailRequestSchema>;

export interface RegisterResponse {
  publicId: string;
  conversationId: string;
  adminPublicKeys: z.infer<typeof PublicKeysSchema>;
}

export interface ChallengeResponse {
  challengeId: string;
  challenge: string;
  expiresAt: string;
}

export interface MeResponse {
  publicId: string;
  conversationId: string;
  conversationStatus: "ACTIVE" | "ARCHIVED" | "BLOCKED";
  adminPublicKeys: z.infer<typeof PublicKeysSchema>;
}
