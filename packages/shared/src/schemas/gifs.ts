import { z } from "zod";

export const GifSearchQuerySchema = z.object({
  provider: z.enum(["giphy", "klipy"]),
  mode: z.enum(["trending", "search"]).default("trending"),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
export type GifSearchQueryInput = z.infer<typeof GifSearchQuerySchema>;

export interface GifResultDto {
  id: string;
  /** Small thumbnail for the picker grid. */
  previewUrl: string;
  /** The full GIF - inserted into the message and rendered inline. */
  gifUrl: string;
}
