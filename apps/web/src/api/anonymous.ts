import { bytesToBase64url, signChallenge, type Identity } from "@anonchat/crypto";
import { buildLoginChallengeMessage, buildRegistrationProofMessage } from "@anonchat/shared";
import type {
  ChallengeResponse,
  MeResponse,
  RegisterResponse,
  VisitorInsightConsentRequestInput,
  VisitorInsightsStatusDto,
} from "@anonchat/shared";
import { api } from "./client.js";
import type { PushSubscriptionKeys } from "../push/webPush.js";

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

export function deleteAnonymousIdentity(): Promise<void> {
  return api.delete<void>("/anonymous/me");
}

/** Opts this identity into (or, with "", out of) an email when the admin replies. */
export function setNotificationEmail(email: string): Promise<void> {
  return api.post<void>("/anonymous/notification-email", { email });
}

export function subscribeUserPush(subscription: PushSubscriptionKeys): Promise<void> {
  return api.post<void>("/anonymous/push/subscribe", subscription);
}

export function unsubscribeUserPush(endpoint: string): Promise<{ unsubscribeBrowser: boolean }> {
  return api.post("/anonymous/push/unsubscribe", { endpoint });
}

export function getVisitorInsightsStatus(): Promise<VisitorInsightsStatusDto> {
  return api.get("/anonymous/insights/status");
}

export function consentToVisitorInsights(input: VisitorInsightConsentRequestInput): Promise<void> {
  return api.post("/anonymous/insights/consent", input);
}

export function revokeVisitorInsights(): Promise<void> {
  return api.delete("/anonymous/insights");
}
