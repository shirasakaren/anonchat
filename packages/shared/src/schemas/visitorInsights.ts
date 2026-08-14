import { z } from "zod";

const ShortText = z.string().trim().max(100).nullable();

/** Browser-reported diagnostics collected only after explicit consent.
 * These fields are descriptive and must never be used as an identity or
 * anti-abuse fingerprint. */
export const VisitorInsightConsentRequestSchema = z
  .object({
    consented: z.literal(true),
    userAgent: z.string().max(1000).nullable(),
    browserName: ShortText,
    browserVersion: ShortText,
    osName: ShortText,
    osVersion: ShortText,
    deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]),
    platform: ShortText,
    language: z.string().max(35).nullable(),
    languages: z.array(z.string().max(35)).max(10),
    timezone: z.string().max(100).nullable(),
    screenWidth: z.number().int().min(0).max(100_000).nullable(),
    screenHeight: z.number().int().min(0).max(100_000).nullable(),
    viewportWidth: z.number().int().min(0).max(100_000).nullable(),
    viewportHeight: z.number().int().min(0).max(100_000).nullable(),
    pixelRatio: z.number().min(0.1).max(20).nullable(),
    colorDepth: z.number().int().min(0).max(128).nullable(),
    touchPoints: z.number().int().min(0).max(100).nullable(),
    hardwareConcurrency: z.number().int().min(0).max(1024).nullable(),
    deviceMemoryGb: z.number().min(0).max(1024).nullable(),
    connectionType: ShortText,
    connectionEffectiveType: ShortText,
    connectionDownlinkMbps: z.number().min(0).max(100_000).nullable(),
    connectionRttMs: z.number().int().min(0).max(3_600_000).nullable(),
    connectionSaveData: z.boolean().nullable(),
    referrerOrigin: z.union([z.literal(""), z.string().url().max(500)]).nullable(),
  })
  .strict();

export type VisitorInsightConsentRequestInput = z.infer<typeof VisitorInsightConsentRequestSchema>;

export interface VisitorInsightsStatusDto {
  enabled: boolean;
  consentedAt: string | null;
  expiresAt: string | null;
}

export interface VisitorInsightDto {
  consentedAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
  deviceType: string | null;
  platform: string | null;
  language: string | null;
  languages: string[];
  timezone: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  pixelRatio: number | null;
  colorDepth: number | null;
  touchPoints: number | null;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  connectionType: string | null;
  connectionEffectiveType: string | null;
  connectionDownlinkMbps: number | null;
  connectionRttMs: number | null;
  connectionSaveData: boolean | null;
  referrerOrigin: string | null;
  geoCountryCode: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
  geoCity: string | null;
  geoPostalCode: string | null;
  geoLatitude: number | null;
  geoLongitude: number | null;
  geoTimezone: string | null;
  networkAsn: number | null;
  networkOrg: string | null;
  networkIsp: string | null;
}
