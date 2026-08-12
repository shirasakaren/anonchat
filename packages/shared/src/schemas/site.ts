import type { PublicKeysInput } from "./common.js";

export interface PublicSiteInfoDto {
  onboardingComplete: boolean;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  contactLinks: { label: string; url: string }[];
  pgpPublicKey: string | null;
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
}
