/**
 * Prints a fresh VAPID keypair to paste into .env as VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY, plus a reminder to set VAPID_SUBJECT. Web Push is
 * inert until all three are set (see src/env.ts) - there's nothing to
 * "install" beyond that, the keypair has no relationship to any external
 * service.
 *
 * Usage: pnpm --filter @anonchat/server exec tsx scripts/generateVapidKeys.ts
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("Add these to your .env:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com  # or https://your-site.example`);
