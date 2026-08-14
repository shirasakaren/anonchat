import type { PublicKeysInput } from "./common.js";

export interface PublicSiteInfoDto {
  onboardingComplete: boolean;
  siteTitle: string;
  displayName: string;
  bio: string;
  welcomeMessage: string;
  avatarUrl: string | null;
  profilePhotos: string[];
  contactLinks: { label: string; url: string }[];
  pgpPublicKey: string | null;
  privacyPolicyUrl: string | null;
  adminPublicKeys: PublicKeysInput | null;
  presenceEnabled: boolean;
  theme: string;
  limits: {
    maxMessageLength: number;
    maxAttachmentSizeMb: number;
    maxAttachmentsPerMessage: number;
    messageEditWindowMinutes: number;
  };
  turnstileSiteKey: string | null;
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
