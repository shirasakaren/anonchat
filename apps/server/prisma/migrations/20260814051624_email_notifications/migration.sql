-- AlterTable
ALTER TABLE "anonymous_users" ADD COLUMN     "notificationEmail" TEXT,
ADD COLUMN     "notificationEmailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "adminEmailDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adminEmailDigestIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "adminNotificationEmail" TEXT,
ADD COLUMN     "lastAdminDigestSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "messages_senderType_createdAt_idx" ON "messages"("senderType", "createdAt");
