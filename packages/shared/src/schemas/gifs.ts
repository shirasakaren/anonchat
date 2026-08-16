import { z } from "zod";

export const GifSearchQuerySchema = z.object({
  /// "all" aggregates every configured provider into one merged, interleaved
  /// result list - the picker's single grid when both GIPHY and KLIPY keys
  /// are active.
  provider: z.enum(["giphy", "klipy", "all"]),
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
