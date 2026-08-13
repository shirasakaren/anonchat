-- Admin-only mute state for a conversation (suppresses new-message
-- notifications). CamelCase to match the rest of this schema.
ALTER TABLE "conversations" ADD COLUMN "mutedAt" TIMESTAMP(3);
