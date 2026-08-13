import { z } from "zod";

export const LinkPreviewQuerySchema = z.object({
  url: z.string().url().max(2048),
});
export type LinkPreviewQueryInput = z.infer<typeof LinkPreviewQuerySchema>;

export interface LinkPreviewDto {
  url: string;
  title: string | null;
  description: string | null;
  /** A data: URI (already fetched and inlined server-side), never a
   *  remote URL - keeps the client from needing any img-src CSP change
   *  for arbitrary third-party image hosts. */
  image: string | null;
  siteName: string | null;
}
