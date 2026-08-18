import { bytesToBase64url, signChallenge, type EncryptedPayload, type Identity } from "@anonchat/crypto";
import { buildRegistrationProofMessage } from "@anonchat/shared";
import type {
  AdminConversationDto,
  AdminConversationSummaryDto,
  AdminSessionDto,
  AdminSummaryDto,
  AuditLogEntryDto,
  CannedReplyDto,
  ConversationNoteDto,
  MessageDto,
  MessagePage,
  NoteAssetDto,
  RetentionRequestInput,
  SiteSettingsRequestInput,
  SiteSettingsDto,
  VisitorInsightDto,
} from "@anonchat/shared";
import { api, apiFetch, apiUpload } from "./client.js";
import type { OutgoingAttachment } from "./conversation.js";
import type { PushSubscriptionKeys } from "../push/webPush.js";

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

export function updateSettings(patch: SiteSettingsRequestInput): Promise<SiteSettingsDto> {
  return api.patch<SiteSettingsDto>("/admin/settings", patch);
}

export async function uploadAvatar(file: File | Blob): Promise<SiteSettingsDto> {
  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : "avatar.jpg");
  return apiFetch<SiteSettingsDto>("/admin/avatar", { method: "POST", body: form });
}

/** Imports only the profile picture from Gravatar for the given email -
 *  never the display name or bio Gravatar also exposes. */
export function importGravatarAvatar(email: string): Promise<SiteSettingsDto> {
  return api.post<SiteSettingsDto>("/admin/avatar/gravatar", { email });
}

export async function uploadProfileMedia(file: File): Promise<SiteSettingsDto> {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiFetch<SiteSettingsDto>("/admin/profile-media", { method: "POST", body: form });
}

export function deleteProfileMedia(id: string): Promise<void> {
  return api.delete<void>(`/admin/profile-media/${encodeURIComponent(id)}`);
}

export function reorderProfileMedia(ids: string[]): Promise<SiteSettingsDto> {
  return api.put<SiteSettingsDto>("/admin/profile-media/order", { ids });
}

export function subscribeAdminPush(subscription: PushSubscriptionKeys): Promise<void> {
  return api.post<void>("/admin/push/subscribe", subscription);
}

export function unsubscribeAdminPush(endpoint: string): Promise<{ unsubscribeBrowser: boolean }> {
  return api.post("/admin/push/unsubscribe", { endpoint });
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

export function getConversationVisitorInsight(id: string): Promise<{ insight: VisitorInsightDto | null }> {
  return api.get(`/admin/conversations/${id}/insights`);
}

/** Sets the admin's private alias for a conversation; "" clears it. */
export function updateConversationAlias(id: string, alias: string): Promise<AdminConversationDto> {
  return api.patch<AdminConversationDto>(`/admin/conversations/${id}/alias`, { alias });
}

export function getAdminMessages(conversationId: string, cursor?: string, latest?: boolean): Promise<MessagePage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  // `latest` fetches only the single newest message (desc, limit 1) - the
  // inbox preview needs that, since the default page is the OLDEST chunk
  // and its tail is not the conversation's last message once a
  // conversation outgrows one page.
  if (latest) {
    params.set("direction", "desc");
    params.set("limit", "1");
  }
  const qs = params.toString();
  return api.get<MessagePage>(`/admin/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`);
}

export async function sendAdminMessage(
  conversationId: string,
  params: {
    content: EncryptedPayload;
    replyToId?: string | null;
    clientId?: string | null;
    attachments?: OutgoingAttachment[];
    onUploadProgress?: (progress: number) => void;
  },
): Promise<MessageDto> {
  if (!params.attachments || params.attachments.length === 0) {
    return api.post<MessageDto>(`/admin/conversations/${conversationId}/messages`, {
      content: params.content,
      replyToId: params.replyToId ?? null,
      ...(params.clientId ? { clientId: params.clientId } : {}),
    });
  }
  const form = new FormData();
  form.append("content", JSON.stringify(params.content));
  if (params.replyToId) form.append("replyToId", params.replyToId);
  if (params.clientId) form.append("clientId", params.clientId);
  for (const attachment of params.attachments) {
    form.append("attachmentMeta", JSON.stringify(attachment.meta));
    form.append("attachment", attachment.blob);
  }
  return apiUpload<MessageDto>(`/admin/conversations/${conversationId}/messages`, form, params.onUploadProgress);
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

export function updateAdminRetention(
  conversationId: string,
  retention: RetentionRequestInput,
): Promise<AdminConversationDto> {
  return api.patch<AdminConversationDto>(`/admin/conversations/${conversationId}/retention`, retention);
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

export function muteConversation(id: string): Promise<AdminConversationDto> {
  return api.post<AdminConversationDto>(`/admin/conversations/${id}/mute`);
}

export function unmuteConversation(id: string): Promise<AdminConversationDto> {
  return api.post<AdminConversationDto>(`/admin/conversations/${id}/unmute`);
}

export function softDeleteConversation(id: string): Promise<void> {
  return api.delete<void>(`/admin/conversations/${id}`);
}

export function bulkConversationAction(
  ids: string[],
  action: "archive" | "delete" | "block" | "unarchive" | "unblock",
): Promise<void> {
  return api.post<void>("/admin/conversations/bulk", { ids, action });
}

export function permanentlyDeleteConversation(id: string): Promise<void> {
  return api.delete<void>(`/admin/conversations/${id}/permanent`);
}

export function adminAttachmentUrl(conversationId: string, attachmentId: string): string {
  return `/api/admin/conversations/${conversationId}/attachments/${attachmentId}`;
}

export function getAdminNote(conversationId: string): Promise<{ note: ConversationNoteDto | null }> {
  return api.get(`/admin/conversations/${conversationId}/note`);
}

export function saveAdminNote(conversationId: string, content: EncryptedPayload): Promise<ConversationNoteDto> {
  return api.put(`/admin/conversations/${conversationId}/note`, { content });
}

export function uploadAdminNoteAsset(
  conversationId: string,
  meta: EncryptedPayload,
  blob: Blob,
): Promise<NoteAssetDto> {
  const form = new FormData();
  form.append("meta", JSON.stringify(meta));
  form.append("asset", blob, "encrypted-note-asset");
  return apiFetch(`/admin/conversations/${conversationId}/note/assets`, { method: "POST", body: form });
}

export function adminNoteAssetUrl(conversationId: string, assetId: string): string {
  return `/api/admin/conversations/${encodeURIComponent(conversationId)}/note/assets/${encodeURIComponent(assetId)}`;
}

export function deleteAdminNoteAsset(conversationId: string, assetId: string): Promise<void> {
  return api.delete(
    `/admin/conversations/${encodeURIComponent(conversationId)}/note/assets/${encodeURIComponent(assetId)}`,
  );
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
