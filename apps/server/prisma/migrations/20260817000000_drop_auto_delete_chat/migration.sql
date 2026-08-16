-- The auto-delete chat feature (DISCONNECT / BOTH_READ / AFTER_DAYS modes)
-- was removed from the product: disappearing messages are the single,
-- conversation-wide retention control. The columns were added in
-- 20260816145459 and are dropped here; any conversation that had an
-- auto-delete mode set simply reverts to no automatic deletion.
ALTER TABLE "conversations" DROP COLUMN "autoDeleteMode";
ALTER TABLE "conversations" DROP COLUMN "autoDeleteDays";
DROP TYPE "AutoDeleteMode";
