-- CreateEnum
CREATE TYPE "AutoDeleteMode" AS ENUM ('OFF', 'DISCONNECT', 'BOTH_READ', 'AFTER_DAYS');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "autoDeleteDays" INTEGER,
ADD COLUMN     "autoDeleteMode" "AutoDeleteMode" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "disappearingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disappearingOnLogout" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disappearingSeconds" INTEGER;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "messages_expiresAt_idx" ON "messages"("expiresAt");
