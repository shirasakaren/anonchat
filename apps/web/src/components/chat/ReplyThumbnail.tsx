import { useEffect, useState } from "react";
import { decryptBlob } from "@anonchat/crypto";
import { getCachedAttachment, putCachedAttachment } from "../../crypto/attachmentCache.js";
import { toBlobPart } from "../../crypto/conversationCrypto.js";

interface Props {
  attachmentId: string;
  sizeBytes: number;
  mimetype: string;
  downloadUrl: string;
  conversationKey: Uint8Array;
}

/**
 * Ultra-small decrypted preview of the image a reply quotes - shown next to
 * the "Photo · filename" label in both the composer's active reply banner
 * and the quoted chip above a sent message. Reuses the same ciphertext
 * cache as the full attachment view (attachmentCache.ts): if the image was
 * already opened in the thread this loads instantly with no network call.
 * Best-effort and silent - a failed fetch/decrypt just leaves the label
 * without a thumbnail; this is decorative, not the primary way to read the
 * attachment, so it never toasts.
 */
export function ReplyThumbnail({ attachmentId, sizeBytes, mimetype, downloadUrl, conversationKey }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        let raw = await getCachedAttachment(attachmentId, sizeBytes);
        if (!raw) {
          const response = await fetch(downloadUrl, { credentials: "include" });
          if (!response.ok) return;
          raw = new Uint8Array(await response.arrayBuffer());
          void putCachedAttachment(attachmentId, sizeBytes, raw);
        }
        const plaintext = toBlobPart(decryptBlob(conversationKey, raw));
        const blob = new Blob([plaintext], { type: mimetype });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        // Silent - see file doc comment.
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId, sizeBytes, mimetype, downloadUrl, conversationKey]);

  if (!url) return null;
  return <img src={url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />;
}
