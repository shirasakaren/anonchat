-- The previous migration created "admin_alias" in snake_case, but every
-- other column in this schema (anonymousUserId, lastMessageAt, ...) is
-- camelCase and Prisma's field name "adminAlias" maps to "adminAlias".
ALTER TABLE "conversations" RENAME COLUMN "admin_alias" TO "adminAlias";
