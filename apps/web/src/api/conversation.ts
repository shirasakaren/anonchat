import type { EncryptedPayload } from "@anonchat/crypto";
import type { ConversationDto, MessageDto, MessagePage } from "@anonchat/shared";
import { api, apiFetch } from "./client.js";

export function getConversation(): Promise<ConversationDto> {
  return api.get<ConversationDto>("/conversation");
}

export function getMessages(cursor?: string): Promise<MessagePage> {
  return api.get<MessagePage>(`/conversation/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
}

export interface OutgoingAttachment {
  meta: EncryptedPayload;
  blob: Blob;
}

export async function sendMessage(params: {
  content: EncryptedPayload;
  replyToId?: string | null;
  attachments?: OutgoingAttachment[];
}): Promise<MessageDto> {
  if (!params.attachments || params.attachments.length === 0) {
    return api.post<MessageDto>("/conversation/messages", { content: params.content, replyToId: params.replyToId ?? null });
  }
  const form = new FormData();
  form.append("content", JSON.stringify(params.content));
  if (params.replyToId) form.append("replyToId", params.replyToId);
  for (const attachment of params.attachments) {
    form.append("attachmentMeta", JSON.stringify(attachment.meta));
    form.append("attachment", attachment.blob);
  }
  return apiFetch<MessageDto>("/conversation/messages", { method: "POST", body: form });
}

export function editMessage(id: string, content: EncryptedPayload): Promise<MessageDto> {
  return api.patch<MessageDto>(`/conversation/messages/${id}`, { content });
}

export function deleteMessage(id: string): Promise<void> {
  return api.delete<void>(`/conversation/messages/${id}`);
}

export function setReaction(id: string, emoji: EncryptedPayload): Promise<void> {
  return api.post<void>(`/conversation/messages/${id}/reactions`, { emoji });
}

export function clearReaction(id: string): Promise<void> {
  return api.delete<void>(`/conversation/messages/${id}/reactions`);
}

export function markRead(upToMessageId: string): Promise<{ upToMessageId: string; readAt: string }> {
  return api.post("/conversation/read", { upToMessageId });
}

export function attachmentUrl(id: string): string {
  return `/api/conversation/attachments/${id}`;
}
