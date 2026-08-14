import {
  base64urlToBytes,
  decryptJSON,
  deriveConversationKey,
  encryptJSON,
  type EncryptedPayload,
  type Identity,
} from "@anonchat/crypto";

export interface MessageEnvelope {
  text: string;
}

export interface AttachmentMetaEnvelope {
  filename: string;
  mimetype: string;
  size: number;
}

export interface ReactionEnvelope {
  emoji: string;
}

export interface NoteEnvelope {
  document: unknown;
}

export interface MessageDecryptionResult {
  text: string;
  error: string | null;
}

export const MESSAGE_DECRYPTION_HELP =
  "The encrypted data does not match this conversation key. Restore the recovery key that created this identity. If the correct key is already active, the ciphertext is damaged and the sender must resend the message.";

export function getConversationKey(
  myIdentity: Identity,
  theirExchangePublicKeyB64: string,
  conversationId: string,
): Uint8Array {
  return deriveConversationKey(
    myIdentity.exchangeSecretKey,
    base64urlToBytes(theirExchangePublicKeyB64),
    conversationId,
  );
}

export function encryptMessageText(key: Uint8Array, text: string): EncryptedPayload {
  return encryptJSON<MessageEnvelope>(key, { text });
}

export function decryptMessageText(key: Uint8Array, payload: EncryptedPayload): string {
  return decryptMessageTextWithStatus(key, payload).text;
}

export function decryptMessageTextWithStatus(key: Uint8Array, payload: EncryptedPayload): MessageDecryptionResult {
  try {
    const envelope = decryptJSON<MessageEnvelope>(key, payload);
    if (typeof envelope.text !== "string") throw new Error("Invalid message envelope");
    return { text: envelope.text, error: null };
  } catch {
    return { text: "", error: MESSAGE_DECRYPTION_HELP };
  }
}

export function encryptAttachmentMeta(key: Uint8Array, meta: AttachmentMetaEnvelope): EncryptedPayload {
  return encryptJSON<AttachmentMetaEnvelope>(key, meta);
}

export function decryptAttachmentMeta(key: Uint8Array, payload: EncryptedPayload): AttachmentMetaEnvelope | null {
  try {
    return decryptJSON<AttachmentMetaEnvelope>(key, payload);
  } catch {
    return null;
  }
}

export function encryptReaction(key: Uint8Array, emoji: string): EncryptedPayload {
  return encryptJSON<ReactionEnvelope>(key, { emoji });
}

export function decryptReaction(key: Uint8Array, payload: EncryptedPayload): string | null {
  try {
    return decryptJSON<ReactionEnvelope>(key, payload).emoji;
  } catch {
    return null;
  }
}

export function encryptNoteDocument(key: Uint8Array, document: unknown): EncryptedPayload {
  return encryptJSON<NoteEnvelope>(key, { document });
}

export function decryptNoteDocument(key: Uint8Array, payload: EncryptedPayload): unknown {
  try {
    return decryptJSON<NoteEnvelope>(key, payload).document;
  } catch {
    return null;
  }
}

/** Copies into a plain ArrayBuffer-backed Uint8Array so it satisfies BlobPart - noble's Uint8Array<ArrayBufferLike> return type isn't directly assignable. */
export function toBlobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}
