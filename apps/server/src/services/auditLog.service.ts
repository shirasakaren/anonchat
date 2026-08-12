import type { Prisma } from "@prisma/client";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type AuditLogEntryDto } from "@anonchat/shared";
import { prisma } from "../db.js";

export async function recordAudit(
  adminId: string | null,
  action: string,
  target?: { type: string; id: string },
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      metadataJson: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listAuditLog(options: {
  cursor?: string;
  limit?: number;
}): Promise<{ entries: AuditLogEntryDto[]; nextCursor: string | null }> {
  const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const rows = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    entries: page.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: (row.metadataJson as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}
