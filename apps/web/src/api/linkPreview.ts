import type { LinkPreviewDto } from "@anonchat/shared";
import { api } from "./client.js";

/**
 * A link preview is a UI nicety, never something a failure should
 * interrupt a conversation over - swallows every error (rate limited,
 * the feature disabled server-side, a network blip, an unfetchable URL)
 * and just renders nothing rather than propagating a rejection into the
 * middle of a message render.
 */
export async function getLinkPreview(url: string): Promise<LinkPreviewDto | null> {
  try {
    const result = await api.get<LinkPreviewDto | undefined>(`/link-preview?url=${encodeURIComponent(url)}`);
    return result ?? null;
  } catch {
    return null;
  }
}
