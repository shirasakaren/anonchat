-- Admin-only nickname for a conversation's anonymous contact.
ALTER TABLE "conversations" ADD COLUMN "admin_alias" TEXT;
