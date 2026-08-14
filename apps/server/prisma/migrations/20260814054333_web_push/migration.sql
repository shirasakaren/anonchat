-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "adminPushEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "anonymousUserId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_adminId_idx" ON "push_subscriptions"("adminId");

-- CreateIndex
CREATE INDEX "push_subscriptions_anonymousUserId_idx" ON "push_subscriptions"("anonymousUserId");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_anonymousUserId_fkey" FOREIGN KEY ("anonymousUserId") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
