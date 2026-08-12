import { z } from "zod";
import { Base64UrlSchema, PaginationQuerySchema, PublicKeysSchema } from "./common.js";
import type { ConversationStatus } from "../enums.js";

export const UsernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/, "letters, numbers, underscore, dot, dash only");

export const PasswordSchema = z.string().min(10).max(256);

export const OnboardingRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  displayName: z.string().min(1).max(80),
  signingPublicKey: Base64UrlSchema.max(64),
  exchangePublicKey: Base64UrlSchema.max(64),
  proof: Base64UrlSchema.max(256),
  theme: z.string().min(1).max(64).optional(),
});
export type OnboardingRequestInput = z.infer<typeof OnboardingRequestSchema>;

export const AdminLoginRequestSchema = z.object({
  username: UsernameSchema,
  password: z.string().min(1).max(256),
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type AdminLoginRequestInput = z.infer<typeof AdminLoginRequestSchema>;

export const TotpVerifyRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export type TotpVerifyRequestInput = z.infer<typeof TotpVerifyRequestSchema>;

export const SiteSettingsRequestSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  contactLinks: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        url: z.string().url().max(500),
      }),
    )
    .max(10)
    .optional(),
  pgpPublicKey: z.string().max(20_000).optional(),
  presenceEnabled: z.boolean().optional(),
  theme: z.string().min(1).max(64).optional(),
});
export type SiteSettingsRequestInput = z.infer<typeof SiteSettingsRequestSchema>;

export const CannedReplyRequestSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(4000),
});
export type CannedReplyRequestInput = z.infer<typeof CannedReplyRequestSchema>;

export const AdminConversationsQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["ACTIVE", "ARCHIVED", "BLOCKED", "ALL", "UNREAD", "READ"]).optional(),
  q: z.string().max(200).optional(),
});
export type AdminConversationsQueryInput = z.infer<typeof AdminConversationsQuerySchema>;

export interface AdminSummaryDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totpEnabled: boolean;
  publicKeys: z.infer<typeof PublicKeysSchema>;
}

export interface AdminSessionDto {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface AuditLogEntryDto {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CannedReplyDto {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminConversationSummaryDto {
  id: string;
  publicId: string;
  status: ConversationStatus;
  unreadCount: number;
  createdAt: string;
  lastMessageAt: string | null;
  /** Needed by the admin's client to derive the shared conversation key via ECDH, for client-side previews/search. */
  anonymousExchangePublicKey: string;
}

export interface SiteSettingsDto {
  onboardingComplete: boolean;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  contactLinks: { label: string; url: string }[];
  pgpPublicKey: string | null;
  presenceEnabled: boolean;
  theme: string;
  adminPublicKeys: z.infer<typeof PublicKeysSchema> | null;
}
