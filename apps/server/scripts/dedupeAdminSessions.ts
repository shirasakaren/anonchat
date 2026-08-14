/**
 * One-time (but safe to re-run) cleanup for admin sessions created before
 * createAdminSession started deduping by device: collapses each admin's
 * non-revoked sessions down to one per device fingerprint (see
 * src/utils/deviceFingerprint.ts), keeping the most recently active row per
 * device and revoking the rest. Never deletes anything - a revoked session
 * still carries its original timestamps, it just no longer shows up in the
 * Sessions page or counts as live.
 *
 * Usage: pnpm --filter @anonchat/server exec tsx scripts/dedupeAdminSessions.ts
 */
import { prisma } from "../src/db.js";
import { deviceFingerprint } from "../src/utils/deviceFingerprint.js";

async function main() {
  const sessions = await prisma.adminSession.findMany({
    where: { revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
  });

  const byAdminAndFingerprint = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const fingerprint = deviceFingerprint(session.ipAddress, session.userAgent);
    if (!fingerprint) continue; // ungroupable - leave alone, same conservative rule as createAdminSession
    const key = `${session.adminId}:${fingerprint}`;
    const group = byAdminAndFingerprint.get(key);
    if (group) group.push(session);
    else byAdminAndFingerprint.set(key, [session]);
  }

  const toRevoke: string[] = [];
  for (const [key, group] of byAdminAndFingerprint) {
    if (group.length <= 1) continue;
    // Already sorted lastSeenAt desc from the query above - keep [0], revoke the rest.
    const [keep, ...stale] = group;
    console.log(
      `\nDevice ${key.split(":").slice(1).join(":")}: ${group.length} sessions -> keeping ${keep!.id} ` +
        `(last active ${keep!.lastSeenAt.toISOString()})`,
    );
    for (const s of stale) {
      console.log(
        `  revoking ${s.id} (last active ${s.lastSeenAt.toISOString()}, created ${s.createdAt.toISOString()})`,
      );
      toRevoke.push(s.id);
    }
  }

  console.log(`\nFound ${sessions.length} live sessions across ${byAdminAndFingerprint.size} device groups.`);
  console.log(`Revoking ${toRevoke.length} duplicate session(s), keeping the most recently active one per device.`);

  if (toRevoke.length === 0) return;

  const result = await prisma.adminSession.updateMany({
    where: { id: { in: toRevoke } },
    data: { revokedAt: new Date() },
  });
  console.log(`Done - revoked ${result.count} session(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
