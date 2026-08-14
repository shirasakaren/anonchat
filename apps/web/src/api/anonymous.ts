import { bytesToBase64url, signChallenge, type Identity } from "@anonchat/crypto";
import { buildLoginChallengeMessage, buildRegistrationProofMessage } from "@anonchat/shared";
import type { ChallengeResponse, MeResponse, RegisterResponse } from "@anonchat/shared";
import { api } from "./client.js";

export function registerAnonymousIdentity(identity: Identity): Promise<RegisterResponse> {
  const signingPublicKey = bytesToBase64url(identity.signingPublicKey);
  const exchangePublicKey = bytesToBase64url(identity.exchangePublicKey);
  const proof = signChallenge(
    identity.signingSecretKey,
    buildRegistrationProofMessage(signingPublicKey, exchangePublicKey),
  );
  return api.post<RegisterResponse>("/anonymous/register", {
    signingPublicKey,
    exchangePublicKey,
    proof: bytesToBase64url(proof),
  });
}

export async function recoverAnonymousSession(identity: Identity): Promise<RegisterResponse> {
  const challenge = await api.post<ChallengeResponse>("/anonymous/challenge", { publicId: identity.publicId });
  const signature = signChallenge(identity.signingSecretKey, buildLoginChallengeMessage(challenge.challenge));
  return api.post<RegisterResponse>("/anonymous/recover", {
    publicId: identity.publicId,
    challengeId: challenge.challengeId,
    signature: bytesToBase64url(signature),
  });
}

export function getAnonymousMe(): Promise<MeResponse> {
  return api.get<MeResponse>("/anonymous/me");
}

export function logoutAnonymous(): Promise<void> {
  return api.post<void>("/anonymous/logout");
}

/** Opts this identity into (or, with "", out of) an email when the admin replies. */
export function setNotificationEmail(email: string): Promise<void> {
  return api.post<void>("/anonymous/notification-email", { email });
}
