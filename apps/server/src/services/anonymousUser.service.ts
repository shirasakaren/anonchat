import { Prisma } from "@prisma/client";
import { derivePublicId, verifyChallenge } from "@anonchat/crypto";
import { buildLoginChallengeMessage, buildRegistrationProofMessage } from "@anonchat/shared";
import { prisma } from "../db.js";
import { consumeChallenge, issueChallenge } from "../security/challengeStore.js";
import { Errors } from "../utils/errors.js";

export async function registerAnonymousUser(params: {
  displayName?: string;
  signingPublicKey: Uint8Array;
  exchangePublicKey: Uint8Array;
  signingPublicKeyB64: string;
  exchangePublicKeyB64: string;
  proof: Uint8Array;
  ip: string | null;
  storeIp: boolean;
}) {
  const message = buildRegistrationProofMessage(params.signingPublicKeyB64, params.exchangePublicKeyB64);
  if (!verifyChallenge(params.signingPublicKey, message, params.proof)) {
    throw Errors.badRequest("Could not verify that you control the submitted key.");
  }

  const publicId = derivePublicId(params.signingPublicKey, params.exchangePublicKey);

  try {
    return await prisma.anonymousUser.create({
      data: {
        publicId,
        displayName: params.displayName?.trim() || null,
        signingPublicKey: Buffer.from(params.signingPublicKey),
        exchangePublicKey: Buffer.from(params.exchangePublicKey),
        registrationIp: params.storeIp ? params.ip : null,
        conversation: { create: {} },
      },
      include: { conversation: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw Errors.conflict("That identity could not be created, please try again.");
    }
    throw error;
  }
}

export async function beginAnonymousLogin(publicId: string) {
  const user = await prisma.anonymousUser.findUnique({ where: { publicId } });
  if (!user || user.status === "DELETED") {
    throw Errors.notFound("No identity found for that id. Check your recovery key and try again.");
  }
  return issueChallenge(publicId);
}

export async function completeAnonymousLogin(params: { publicId: string; challengeId: string; signature: Uint8Array }) {
  const user = await prisma.anonymousUser.findUnique({
    where: { publicId: params.publicId },
    include: { conversation: true },
  });
  if (!user || user.status === "DELETED") {
    throw Errors.notFound("No identity found for that id. Check your recovery key and try again.");
  }

  const challenge = consumeChallenge(params.challengeId, params.publicId);
  if (!challenge) {
    throw Errors.badRequest("This login attempt expired. Please try again.");
  }

  const message = buildLoginChallengeMessage(challenge);
  if (!verifyChallenge(user.signingPublicKey, message, params.signature)) {
    throw Errors.unauthorized("Invalid recovery credentials.");
  }

  return user;
}
