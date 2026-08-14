import { prisma } from "../db.js";
import type { SiteSettings } from "@prisma/client";
import type { MessagingLimitsDto } from "@anonchat/shared";

export async function getSiteSettings() {
  const existing = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.siteSettings.create({ data: { id: 1 } });
}

export function toMessagingLimits(settings: SiteSettings): MessagingLimitsDto {
  return {
    maxMessageLength: settings.maxMessageLength,
    maxAttachmentsPerMessage: settings.maxAttachmentsPerMessage,
    messageEditWindowMinutes: settings.messageEditWindowMinutes,
    attachmentSize: {
      globalMb: settings.maxAttachmentSizeMb,
      imageMb: Math.min(settings.maxImageAttachmentSizeMb, settings.maxAttachmentSizeMb),
      videoMb: Math.min(settings.maxVideoAttachmentSizeMb, settings.maxAttachmentSizeMb),
      audioMb: Math.min(settings.maxAudioAttachmentSizeMb, settings.maxAttachmentSizeMb),
      documentMb: Math.min(settings.maxDocumentAttachmentSizeMb, settings.maxAttachmentSizeMb),
      otherMb: Math.min(settings.maxOtherAttachmentSizeMb, settings.maxAttachmentSizeMb),
    },
  };
}
