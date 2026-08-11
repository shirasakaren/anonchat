import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  base64urlToBytes,
  bytesToBase64url,
  decryptJSON,
  deriveConversationKey,
  deriveIdentity,
  encryptJSON,
  generateRecoverySecret,
  signChallenge,
} from "@termine/crypto";
import { buildRegistrationProofMessage, buildLoginChallengeMessage } from "@termine/shared";
import { buildApp } from "./app.js";
import { prisma } from "./db.js";

/**
 * End-to-end integration coverage against a real Postgres (DATABASE_URL from
 * the environment) using Fastify's inject() - no network sockets needed for
 * HTTP. This is deliberately narrow: it asserts the security invariants the
 * whole product depends on (E2EE round-trip, block enforcement, cross-user
 * isolation, identity recovery), not every route.
 */

interface Jar {
  cookies: Map<string, string>;
  csrf: () => string;
}

function newJar(): Jar {
  const cookies = new Map<string, string>();
  return {
    cookies,
    csrf: () => cookies.get("termine_csrf") ?? "",
  };
}

function applyCookies(jar: Jar, setCookieHeaders: string | string[] | undefined) {
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : setCookieHeaders ? [setCookieHeaders] : [];
  for (const header of headers) {
    const [pair] = header.split(";");
    const [name, value] = pair!.split("=");
    jar.cookies.set(name!, value!);
  }
}

function cookieHeader(jar: Jar): string {
  return [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(
  app: FastifyInstance,
  jar: Jar,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
) {
  const res = await app.inject({
    method,
    url: `/api${url}`,
    headers: {
      cookie: cookieHeader(jar),
      ...(payload !== undefined ? { "content-type": "application/json", "x-termine-csrf": jar.csrf() } : {}),
    },
    payload: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  applyCookies(jar, res.headers["set-cookie"]);
  const body = res.body ? JSON.parse(res.body) : null;
  return { status: res.statusCode, body };
}

async function primeCsrf(app: FastifyInstance, jar: Jar) {
  await call(app, jar, "GET", "/site");
}

function makeIdentity() {
  const secret = generateRecoverySecret();
  const identity = deriveIdentity(secret);
  const proof = signChallenge(
    identity.signingSecretKey,
    buildRegistrationProofMessage(bytesToBase64url(identity.signingPublicKey), bytesToBase64url(identity.exchangePublicKey)),
  );
  return { secret, identity, proof };
}

describe("termine integration", () => {
  let app: FastifyInstance;
  let adminJar: Jar;
  let adminIdentity: ReturnType<typeof makeIdentity>["identity"];

  beforeAll(async () => {
    // Isolate this run's rows loosely by uniquifying the admin username;
    // a fresh schema per run is the ideal but out of scope here.
    app = await buildApp();
    await app.ready();

    adminJar = newJar();
    await primeCsrf(app, adminJar);
    const admin = makeIdentity();
    adminIdentity = admin.identity;
    const onboardRes = await call(app, adminJar, "POST", "/admin/onboarding", {
      username: `owner_${randomUUID().slice(0, 8)}`,
      password: "correct horse battery staple 1",
      displayName: "Test Owner",
      signingPublicKey: bytesToBase64url(admin.identity.signingPublicKey),
      exchangePublicKey: bytesToBase64url(admin.identity.exchangePublicKey),
      proof: bytesToBase64url(admin.proof),
    });
    expect(onboardRes.status).toBe(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("lets an anonymous identity register, message the owner E2E-encrypted, and get a decryptable reply", async () => {
    const userJar = newJar();
    await primeCsrf(app, userJar);
    const user = makeIdentity();

    const registerRes = await call(app, userJar, "POST", "/anonymous/register", {
      signingPublicKey: bytesToBase64url(user.identity.signingPublicKey),
      exchangePublicKey: bytesToBase64url(user.identity.exchangePublicKey),
      proof: bytesToBase64url(user.proof),
    });
    expect(registerRes.status).toBe(201);
    const { conversationId, adminPublicKeys } = registerRes.body;

    const userKey = deriveConversationKey(
      user.identity.exchangeSecretKey,
      base64urlToBytes(adminPublicKeys.exchangePublicKey),
      conversationId,
    );

    const sendRes = await call(app, userJar, "POST", "/conversation/messages", {
      content: encryptJSON(userKey, { text: "Hello!" }),
    });
    expect(sendRes.status).toBe(201);

    const adminKey = deriveConversationKey(adminIdentity.exchangeSecretKey, user.identity.exchangePublicKey, conversationId);
    const adminMessagesRes = await call(app, adminJar, "GET", `/admin/conversations/${conversationId}/messages`);
    expect(adminMessagesRes.status).toBe(200);
    const decrypted = decryptJSON<{ text: string }>(adminKey, adminMessagesRes.body.messages[0].content);
    expect(decrypted.text).toBe("Hello!");

    const replyRes = await call(app, adminJar, "POST", `/admin/conversations/${conversationId}/messages`, {
      content: encryptJSON(adminKey, { text: "Hi there." }),
    });
    expect(replyRes.status).toBe(201);

    const userMessagesRes = await call(app, userJar, "GET", "/conversation/messages");
    const reply = userMessagesRes.body.messages.find((m: { senderType: string }) => m.senderType === "ADMIN");
    expect(decryptJSON<{ text: string }>(userKey, reply.content).text).toBe("Hi there.");
  });

  it("lets an anonymous identity fully recover its conversation from just the recovery secret", async () => {
    const userJar = newJar();
    await primeCsrf(app, userJar);
    const user = makeIdentity();
    const registerRes = await call(app, userJar, "POST", "/anonymous/register", {
      signingPublicKey: bytesToBase64url(user.identity.signingPublicKey),
      exchangePublicKey: bytesToBase64url(user.identity.exchangePublicKey),
      proof: bytesToBase64url(user.proof),
    });
    const { conversationId } = registerRes.body;

    // Simulate a brand new browser: re-derive the identity from the secret alone.
    const freshJar = newJar();
    await primeCsrf(app, freshJar);
    const rederived = deriveIdentity(user.secret);
    const challengeRes = await call(app, freshJar, "POST", "/anonymous/challenge", { publicId: rederived.publicId });
    expect(challengeRes.status).toBe(200);
    const signature = signChallenge(rederived.signingSecretKey, buildLoginChallengeMessage(challengeRes.body.challenge));
    const recoverRes = await call(app, freshJar, "POST", "/anonymous/recover", {
      publicId: rederived.publicId,
      challengeId: challengeRes.body.challengeId,
      signature: bytesToBase64url(signature),
    });
    expect(recoverRes.status).toBe(200);
    expect(recoverRes.body.conversationId).toBe(conversationId);
  });

  it("rejects login with a signature from the wrong identity", async () => {
    const userJar = newJar();
    await primeCsrf(app, userJar);
    const user = makeIdentity();
    await call(app, userJar, "POST", "/anonymous/register", {
      signingPublicKey: bytesToBase64url(user.identity.signingPublicKey),
      exchangePublicKey: bytesToBase64url(user.identity.exchangePublicKey),
      proof: bytesToBase64url(user.proof),
    });

    const attackerJar = newJar();
    await primeCsrf(app, attackerJar);
    const attacker = makeIdentity();
    const challengeRes = await call(app, attackerJar, "POST", "/anonymous/challenge", { publicId: user.identity.publicId });
    const wrongSignature = signChallenge(attacker.identity.signingSecretKey, buildLoginChallengeMessage(challengeRes.body.challenge));
    const recoverRes = await call(app, attackerJar, "POST", "/anonymous/recover", {
      publicId: user.identity.publicId,
      challengeId: challengeRes.body.challengeId,
      signature: bytesToBase64url(wrongSignature),
    });
    expect(recoverRes.status).toBe(401);
  });

  it("blocks a conversation server-side and rejects further user messages even after refresh", async () => {
    const userJar = newJar();
    await primeCsrf(app, userJar);
    const user = makeIdentity();
    const registerRes = await call(app, userJar, "POST", "/anonymous/register", {
      signingPublicKey: bytesToBase64url(user.identity.signingPublicKey),
      exchangePublicKey: bytesToBase64url(user.identity.exchangePublicKey),
      proof: bytesToBase64url(user.proof),
    });
    const { conversationId, adminPublicKeys } = registerRes.body;
    const userKey = deriveConversationKey(
      user.identity.exchangeSecretKey,
      base64urlToBytes(adminPublicKeys.exchangePublicKey),
      conversationId,
    );

    const blockRes = await call(app, adminJar, "POST", `/admin/conversations/${conversationId}/block`);
    expect(blockRes.status).toBe(200);

    const sendRes = await call(app, userJar, "POST", "/conversation/messages", {
      content: encryptJSON(userKey, { text: "still here?" }),
    });
    expect(sendRes.status).toBe(403);

    // A brand new session for the same identity must still be blocked - this isn't
    // just a stale-client-side check.
    const secondSessionJar = newJar();
    await primeCsrf(app, secondSessionJar);
    const rederived = deriveIdentity(user.secret);
    const challengeRes = await call(app, secondSessionJar, "POST", "/anonymous/challenge", { publicId: rederived.publicId });
    const signature = signChallenge(rederived.signingSecretKey, buildLoginChallengeMessage(challengeRes.body.challenge));
    await call(app, secondSessionJar, "POST", "/anonymous/recover", {
      publicId: rederived.publicId,
      challengeId: challengeRes.body.challengeId,
      signature: bytesToBase64url(signature),
    });
    const secondSendRes = await call(app, secondSessionJar, "POST", "/conversation/messages", {
      content: encryptJSON(userKey, { text: "still blocked?" }),
    });
    expect(secondSendRes.status).toBe(403);
  });

  it("never lets one anonymous identity see another's conversation or messages", async () => {
    const jarA = newJar();
    await primeCsrf(app, jarA);
    const userA = makeIdentity();
    const registerA = await call(app, jarA, "POST", "/anonymous/register", {
      signingPublicKey: bytesToBase64url(userA.identity.signingPublicKey),
      exchangePublicKey: bytesToBase64url(userA.identity.exchangePublicKey),
      proof: bytesToBase64url(userA.proof),
    });
    const userKeyA = deriveConversationKey(
      userA.identity.exchangeSecretKey,
      base64urlToBytes(registerA.body.adminPublicKeys.exchangePublicKey),
      registerA.body.conversationId,
    );
    await call(app, jarA, "POST", "/conversation/messages", { content: encryptJSON(userKeyA, { text: "secret A" }) });

    const jarB = newJar();
    await primeCsrf(app, jarB);
    const userB = makeIdentity();
    const registerB = await call(app, jarB, "POST", "/anonymous/register", {
      signingPublicKey: bytesToBase64url(userB.identity.signingPublicKey),
      exchangePublicKey: bytesToBase64url(userB.identity.exchangePublicKey),
      proof: bytesToBase64url(userB.proof),
    });

    expect(registerB.body.conversationId).not.toBe(registerA.body.conversationId);

    const conversationForB = await call(app, jarB, "GET", "/conversation");
    expect(conversationForB.body.id).toBe(registerB.body.conversationId);

    const messagesForB = await call(app, jarB, "GET", "/conversation/messages");
    expect(messagesForB.body.messages).toHaveLength(0);
  });

  it("requires a matching CSRF header on state-changing requests", async () => {
    const jar = newJar();
    await primeCsrf(app, jar);
    const res = await app.inject({
      method: "POST",
      url: "/api/anonymous/register",
      headers: { cookie: cookieHeader(jar), "content-type": "application/json" },
      payload: JSON.stringify({ signingPublicKey: "x", exchangePublicKey: "x", proof: "x" }),
    });
    expect(res.statusCode).toBe(403);
  });
});
