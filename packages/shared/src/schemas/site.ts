import type { PublicKeysInput } from "./common.js";

export type AttachmentLimitCategory = "image" | "video" | "audio" | "document" | "other";

export interface AttachmentSizeLimitsDto {
  globalMb: number;
  imageMb: number;
  videoMb: number;
  audioMb: number;
  documentMb: number;
  otherMb: number;
}

export interface MessagingLimitsDto {
  maxMessageLength: number;
  maxAttachmentsPerMessage: number;
  messageEditWindowMinutes: number;
  attachmentSize: AttachmentSizeLimitsDto;
}

export interface ProfileMediaDto {
  id: string;
  kind: "image" | "video";
  mimetype: string;
  filename: string;
  sizeBytes: number;
  url: string;
}

export interface PublicSiteInfoDto {
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
  adminPublicKeys: PublicKeysInput | null;
  presenceEnabled: boolean;
  theme: string;
  limits: MessagingLimitsDto;
  /** Null when this server has no VAPID_* configured - Web Push is entirely
   *  unavailable in that case (see docs/ARCHITECTURE.md). */
  vapidPublicKey: string | null;
  /** False when the operator has not configured SMTP or Resend. Visitor
   *  email controls and the first-reply prompt stay hidden in that case. */
  emailNotificationsAvailable: boolean;
  visitorInsights: {
    enabled: boolean;
    retentionDays: number;
    collectsIpAddress: boolean;
    coarseGeolocation: boolean;
  };
}
