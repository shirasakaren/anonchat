import { bytesToBase64url, signChallenge, type EncryptedPayload, type Identity } from "@anonchat/crypto";
import { buildRegistrationProofMessage } from "@anonchat/shared";
import type {
  AdminConversationDto,
  AdminConversationSummaryDto,
  AdminSessionDto,
  AdminSummaryDto,
  AuditLogEntryDto,
  CannedReplyDto,
  ConversationDto,
  MessageDto,
  MessagePage,
  SiteSettingsDto,
} from "@anonchat/shared";
import { api, apiFetch } from "./client.js";
import type { OutgoingAttachment } from "./conversation.js";

export function onboardAdmin(params: {
  username: string;
  password: string;
  displayName: string;
  identity: Identity;
  theme?: string;
}): Promise<{ id: string; username: string; displayName: string }> {
  const signingPublicKey = bytesToBase64url(params.identity.signingPublicKey);
  const exchangePublicKey = bytesToBase64url(params.identity.exchangePublicKey);
  const proof = signChallenge(
    params.identity.signingSecretKey,
    buildRegistrationProofMessage(signingPublicKey, exchangePublicKey),
  );
  return api.post("/admin/onboarding", {
    username: params.username,
    password: params.password,
    displayName: params.displayName,
    signingPublicKey,
    exchangePublicKey,
    proof: bytesToBase64url(proof),
    ...(params.theme ? { theme: params.theme } : {}),
  });
}

export interface LoginResult {
  id: string;
  username: string;
  displayName: string;
}

export function loginAdmin(username: string, password: string, totpCode?: string): Promise<LoginResult> {
  return api.post<LoginResult>("/admin/login", { username, password, totpCode });
}

export function logoutAdmin(): Promise<void> {
  return api.post<void>("/admin/logout");
}

export function getAdminMe(): Promise<AdminSummaryDto> {
  return api.get<AdminSummaryDto>("/admin/me");
}

export function listAdminSessions(): Promise<AdminSessionDto[]> {
  return api.get<AdminSessionDto[]>("/admin/sessions");
}

export function revokeAdminSession(id: string): Promise<void> {
  return api.delete<void>(`/admin/sessions/${id}`);
}

export function beginTotpSetup(): Promise<{ secret: string; uri: string }> {
  return api.post("/admin/totp/setup");
}

export function verifyTotpSetup(code: string): Promise<void> {
  return api.post("/admin/totp/verify", { code });
}

export function disableTotp(): Promise<void> {
  return api.post("/admin/totp/disable");
}

export function getSettings(): Promise<SiteSettingsDto> {
  return api.get<SiteSettingsDto>("/admin/settings");
}

export function updateSettings(
  patch: Partial<{
    displayName: string;
    bio: string;
    contactLinks: { label: string; url: string }[];
    pgpPublicKey: string;
    presenceEnabled: boolean;
    theme: string;
  }>,
): Promise<SiteSettingsDto> {
  return api.patch<SiteSettingsDto>("/admin/settings", patch);
}

export async function uploadAvatar(file: File | Blob): Promise<SiteSettingsDto> {
  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : "avatar.jpg");
  return apiFetch<SiteSettingsDto>("/admin/avatar", { method: "POST", body: form });
}

export function listConversations(query: {
  status?: string;
  q?: string;
  cursor?: string;
}): Promise<{ conversations: AdminConversationSummaryDto[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return api.get(`/admin/conversations${qs ? `?${qs}` : ""}`);
}

export function getAdminConversation(id: string): Promise<AdminConversationDto> {
  return api.get<AdminConversationDto>(`/admin/conversations/${id}`);
}

/** Sets the admin's private alias for a conversation; "" clears it. */
export function updateConversationAlias(id: string, alias: string): Promise<AdminConversationDto> {
  return api.patch<AdminConversationDto>(`/admin/conversations/${id}/alias`, { alias });
}

export function getAdminMessages(conversationId: string, cursor?: string): Promise<MessagePage> {
  return api.get<MessagePage>(
    `/admin/conversations/${conversationId}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}

export async function sendAdminMessage(
  conversationId: string,
  params: { content: EncryptedPayload; replyToId?: string | null; attachments?: OutgoingAttachment[] },
): Promise<MessageDto> {
  if (!params.attachments || params.attachments.length === 0) {
    return api.post<MessageDto>(`/admin/conversations/${conversationId}/messages`, {
      content: params.content,
      replyToId: params.replyToId ?? null,
    });
  }
  const form = new FormData();
  form.append("content", JSON.stringify(params.content));
  if (params.replyToId) form.append("replyToId", params.replyToId);
  for (const attachment of params.attachments) {
    form.append("attachmentMeta", JSON.stringify(attachment.meta));
    form.append("attachment", attachment.blob);
  }
  return apiFetch<MessageDto>(`/admin/conversations/${conversationId}/messages`, { method: "POST", body: form });
}

export function editAdminMessage(
  conversationId: string,
  messageId: string,
  content: EncryptedPayload,
): Promise<MessageDto> {
  return api.patch<MessageDto>(`/admin/conversations/${conversationId}/messages/${messageId}`, { content });
}

export function deleteAdminMessage(conversationId: string, messageId: string): Promise<void> {
  return api.delete<void>(`/admin/conversations/${conversationId}/messages/${messageId}`);
}

export function setAdminReaction(conversationId: string, messageId: string, emoji: EncryptedPayload): Promise<void> {
  return api.post<void>(`/admin/conversations/${conversationId}/messages/${messageId}/reactions`, { emoji });
}

export function clearAdminReaction(conversationId: string, messageId: string): Promise<void> {
  return api.delete<void>(`/admin/conversations/${conversationId}/messages/${messageId}/reactions`);
}

export function markAdminRead(
  conversationId: string,
  upToMessageId: string,
): Promise<{ upToMessageId: string; readAt: string }> {
  return api.post(`/admin/conversations/${conversationId}/read`, { upToMessageId });
}

export function archiveConversation(id: string): Promise<AdminConversationDto> {
  return api.post<AdminConversationDto>(`/admin/conversations/${id}/archive`);
}

export function unarchiveConversation(id: string): Promise<AdminConversationDto> {
  return api.post<AdminConversationDto>(`/admin/conversations/${id}/unarchive`);
}

export function blockConversation(id: string): Promise<AdminConversationDto> {
  return api.post<AdminConversationDto>(`/admin/conversations/${id}/block`);
}

export function unblockConversation(id: string): Promise<AdminConversationDto> {
  return api.post<AdminConversationDto>(`/admin/conversations/${id}/unblock`);
}

export function softDeleteConversation(id: string): Promise<void> {
  return api.delete<void>(`/admin/conversations/${id}`);
}

export function permanentlyDeleteConversation(id: string): Promise<void> {
  return api.delete<void>(`/admin/conversations/${id}/permanent`);
}

export function adminAttachmentUrl(conversationId: string, attachmentId: string): string {
  return `/api/admin/conversations/${conversationId}/attachments/${attachmentId}`;
}

export function listCannedReplies(): Promise<CannedReplyDto[]> {
  return api.get<CannedReplyDto[]>("/admin/canned-replies");
}

export function createCannedReply(title: string, body: string): Promise<CannedReplyDto> {
  return api.post<CannedReplyDto>("/admin/canned-replies", { title, body });
}

export function updateCannedReply(id: string, title: string, body: string): Promise<CannedReplyDto> {
  return api.patch<CannedReplyDto>(`/admin/canned-replies/${id}`, { title, body });
}

export function deleteCannedReply(id: string): Promise<void> {
  return api.delete<void>(`/admin/canned-replies/${id}`);
}

export function listAuditLog(cursor?: string): Promise<{ entries: AuditLogEntryDto[]; nextCursor: string | null }> {
  return api.get(`/admin/audit-log${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}
