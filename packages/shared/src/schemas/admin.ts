import { z } from "zod";
import { Base64UrlSchema, CuidSchema, PaginationQuerySchema, PublicKeysSchema } from "./common.js";
import type { ConversationStatus } from "../enums.js";
import type { MessagingLimitsDto, ProfileMediaDto } from "./site.js";
import { ABSOLUTE_MAX_ATTACHMENT_SIZE_MB, ABSOLUTE_MAX_ATTACHMENTS_PER_MESSAGE } from "../constants.js";

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
  siteTitle: z.string().trim().min(1).max(100).optional(),
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  welcomeMessage: z.string().max(4000).optional(),
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
  /// Empty string clears the public policy link.
  privacyPolicyUrl: z.union([z.literal(""), z.string().url().max(500)]).optional(),
  presenceEnabled: z.boolean().optional(),
  theme: z.string().min(1).max(64).optional(),
  /// "" clears it.
  adminNotificationEmail: z.union([z.literal(""), z.string().email().max(320)]).optional(),
  adminEmailDigestEnabled: z.boolean().optional(),
  adminEmailDigestIntervalMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  adminPushEnabled: z.boolean().optional(),
  visitorInsightsEnabled: z.boolean().optional(),
  visitorInsightsRetentionDays: z.coerce.number().int().min(1).max(365).optional(),
  maxMessageLength: z.coerce.number().int().min(1_000).max(100_000).optional(),
  maxAttachmentSizeMb: z.coerce.number().int().min(1).max(ABSOLUTE_MAX_ATTACHMENT_SIZE_MB).optional(),
  maxImageAttachmentSizeMb: z.coerce.number().int().min(1).max(ABSOLUTE_MAX_ATTACHMENT_SIZE_MB).optional(),
  maxVideoAttachmentSizeMb: z.coerce.number().int().min(1).max(ABSOLUTE_MAX_ATTACHMENT_SIZE_MB).optional(),
  maxAudioAttachmentSizeMb: z.coerce.number().int().min(1).max(ABSOLUTE_MAX_ATTACHMENT_SIZE_MB).optional(),
  maxDocumentAttachmentSizeMb: z.coerce.number().int().min(1).max(ABSOLUTE_MAX_ATTACHMENT_SIZE_MB).optional(),
  maxOtherAttachmentSizeMb: z.coerce.number().int().min(1).max(ABSOLUTE_MAX_ATTACHMENT_SIZE_MB).optional(),
  maxAttachmentsPerMessage: z.coerce.number().int().min(1).max(ABSOLUTE_MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  messageEditWindowMinutes: z.coerce.number().int().min(1).max(10_080).optional(),
  rateLimitMessagesPerMinute: z.coerce.number().int().min(1).max(1_000).optional(),
  rateLimitRegistrationsPerHour: z.coerce.number().int().min(1).max(10_000).optional(),
  rateLimitLinkPreviewsPerMinute: z.coerce.number().int().min(1).max(1_000).optional(),
  linkPreviewsEnabled: z.boolean().optional(),
  storeIpAddresses: z.boolean().optional(),
  visitorGeolocationEnabled: z.boolean().optional(),
  adminDigestMinIntervalMinutes: z.coerce.number().int().min(1).max(1_440).optional(),
  replyEmailMinIntervalMinutes: z.coerce.number().int().min(1).max(1_440).optional(),
  /// "" clears the key (hiding that provider).
  giphyApiKey: z.union([z.literal(""), z.string().max(200)]).optional(),
  klipyApiKey: z.union([z.literal(""), z.string().max(200)]).optional(),
});
export type SiteSettingsRequestInput = z.infer<typeof SiteSettingsRequestSchema>;

export const GravatarImportRequestSchema = z.object({
  email: z.string().email().max(320),
});
export type GravatarImportRequestInput = z.infer<typeof GravatarImportRequestSchema>;

export const ProfileMediaParamsSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

export const ProfileMediaOrderRequestSchema = z.object({
  ids: z
    .array(ProfileMediaParamsSchema.shape.id)
    .min(1)
    .max(8)
    .refine((ids) => new Set(ids).size === ids.length, "Media IDs must be unique."),
});
export type ProfileMediaOrderRequestInput = z.infer<typeof ProfileMediaOrderRequestSchema>;

/** No spaces - the title doubles as the "/name" typed in the composer to
 *  trigger this template (see cannedReplySlash.ts on the client), so it
 *  needs to behave like a single command token. */
export const CannedReplyTitleSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/, "letters, numbers, underscore, dash only - no spaces");

export const CannedReplyRequestSchema = z.object({
  title: CannedReplyTitleSchema,
  body: z.string().min(1).max(4000),
});
export type CannedReplyRequestInput = z.infer<typeof CannedReplyRequestSchema>;

export const AdminConversationsQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["ACTIVE", "ARCHIVED", "BLOCKED", "ALL", "UNREAD", "READ"]).optional(),
  q: z.string().max(200).optional(),
});
export type AdminConversationsQueryInput = z.infer<typeof AdminConversationsQuerySchema>;

/** Setting an alias to "" clears it. */
export const ConversationAliasRequestSchema = z.object({
  alias: z.string().trim().max(60),
});
export type ConversationAliasRequestInput = z.infer<typeof ConversationAliasRequestSchema>;

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
  /** Optional name chosen by the visitor. */
  anonymousDisplayName: string | null;
  /** Admin's private nickname for this contact ("" / null = none yet). */
  adminAlias: string | null;
  /** When set, new messages from this conversation don't fire admin notifications. */
  mutedAt: string | null;
  status: ConversationStatus;
  unreadCount: number;
  createdAt: string;
  lastMessageAt: string | null;
  /** Needed by the admin's client to derive the shared conversation key via ECDH, for client-side previews/search. */
  anonymousExchangePublicKey: string;
}

export interface SiteSettingsDto {
  onboardingComplete: boolean;
  siteTitle: string;
  displayName: string;
  bio: string;
  welcomeMessage: string;
  avatarUrl: string | null;
  profileMedia: ProfileMediaDto[];
  contactLinks: { label: string; url: string }[];
  pgpPublicKey: string | null;
  privacyPolicyUrl: string | null;
  presenceEnabled: boolean;
  theme: string;
  adminPublicKeys: z.infer<typeof PublicKeysSchema> | null;
  /** Email notifications are inert unless the server also has EMAIL_DRIVER
   *  configured - see docs/ARCHITECTURE.md. */
  emailNotificationsAvailable: boolean;
  adminNotificationEmail: string | null;
  adminEmailDigestEnabled: boolean;
  adminEmailDigestIntervalMinutes: number;
  /** Push notifications are inert unless the server also has VAPID_*
   *  configured - see docs/ARCHITECTURE.md. */
  pushNotificationsAvailable: boolean;
  adminPushEnabled: boolean;
  visitorInsightsEnabled: boolean;
  visitorInsightsRetentionDays: number;
  limits: MessagingLimitsDto;
  rateLimitMessagesPerMinute: number;
  rateLimitRegistrationsPerHour: number;
  rateLimitLinkPreviewsPerMinute: number;
  linkPreviewsEnabled: boolean;
  storeIpAddresses: boolean;
  visitorGeolocationEnabled: boolean;
  adminDigestMinIntervalMinutes: number;
  replyEmailMinIntervalMinutes: number;
  /** GIF picker API keys - admin-only, never sent to visitors. Empty
   *  string clears the key and hides that provider from the picker. */
  giphyApiKey: string | null;
  klipyApiKey: string | null;
}

export const BulkConversationsRequestSchema = z.object({
  ids: z.array(CuidSchema).min(1).max(100),
  action: z.enum(["archive", "delete", "block", "unarchive"]),
});
export type BulkConversationsRequestInput = z.infer<typeof BulkConversationsRequestSchema>;
