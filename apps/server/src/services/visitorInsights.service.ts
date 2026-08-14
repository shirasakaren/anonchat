import type { Prisma, VisitorInsight } from "@prisma/client";
import { z } from "zod";
import { fetch } from "undici";
import type { VisitorInsightConsentRequestInput, VisitorInsightDto } from "@anonchat/shared";
import { prisma } from "../db.js";
import { loadEnv } from "../env.js";
import { createSsrfSafeDispatcher, isPrivateOrReservedIp } from "../security/ssrfGuard.js";
import { getSiteSettings } from "./siteSettings.service.js";

export const VISITOR_INSIGHTS_CONSENT_VERSION = "2026-08-14";

const geoDispatcher = createSsrfSafeDispatcher();
const IpWhoIsResponseSchema = z.object({
  success: z.boolean(),
  country_code: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  postal: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  connection: z
    .object({
      asn: z.number().optional(),
      org: z.string().optional(),
      isp: z.string().optional(),
    })
    .optional(),
  timezone: z.object({ id: z.string().optional() }).optional(),
});

type GeoFields = Pick<
  Prisma.VisitorInsightUncheckedCreateInput,
  | "geoCountryCode"
  | "geoCountry"
  | "geoRegion"
  | "geoCity"
  | "geoPostalCode"
  | "geoLatitude"
  | "geoLongitude"
  | "geoTimezone"
  | "networkAsn"
  | "networkOrg"
  | "networkIsp"
>;

async function lookupCoarseGeolocation(ip: string): Promise<GeoFields> {
  const env = loadEnv();
  if (env.VISITOR_GEOLOCATION_PROVIDER !== "ipwhois" || isPrivateOrReservedIp(ip)) return {};
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      dispatcher: geoDispatcher,
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return {};
    const parsed = IpWhoIsResponseSchema.safeParse(await response.json());
    if (!parsed.success || !parsed.data.success) return {};
    const value = parsed.data;
    return {
      geoCountryCode: value.country_code ?? null,
      geoCountry: value.country ?? null,
      geoRegion: value.region ?? null,
      geoCity: value.city ?? null,
      geoPostalCode: value.postal ?? null,
      geoLatitude: value.latitude ?? null,
      geoLongitude: value.longitude ?? null,
      geoTimezone: value.timezone?.id ?? null,
      networkAsn: value.connection?.asn ?? null,
      networkOrg: value.connection?.org ?? null,
      networkIsp: value.connection?.isp ?? null,
    };
  } catch {
    // Insight collection must never block chat or turn a third-party outage
    // into a visitor-facing error. Browser diagnostics still save normally.
    return {};
  }
}

function expiresAtFor(retentionDays: number): Date {
  return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1_000);
}

export async function pruneExpiredVisitorInsights(): Promise<void> {
  await prisma.visitorInsight.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

export async function getVisitorInsightsStatus(anonymousUserId: string) {
  const settings = await getSiteSettings();
  if (!settings.visitorInsightsEnabled) return { enabled: false, consentedAt: null, expiresAt: null };
  const insight = await prisma.visitorInsight.findUnique({ where: { anonymousUserId } });
  if (insight && insight.expiresAt <= new Date()) {
    await prisma.visitorInsight.delete({ where: { id: insight.id } });
    return { enabled: true, consentedAt: null, expiresAt: null };
  }
  return {
    enabled: true,
    consentedAt: insight?.consentedAt.toISOString() ?? null,
    expiresAt: insight?.expiresAt.toISOString() ?? null,
  };
}

export async function saveVisitorInsights(
  anonymousUserId: string,
  ip: string,
  input: VisitorInsightConsentRequestInput,
): Promise<void> {
  const settings = await getSiteSettings();
  if (!settings.visitorInsightsEnabled) throw new Error("VISITOR_INSIGHTS_DISABLED");
  // Do not even contact the optional geo provider until both halves of the
  // opt-in are true (admin setting above + visitor consent represented by
  // this endpoint call).
  const geo = await lookupCoarseGeolocation(ip);
  const env = loadEnv();
  const now = new Date();
  const referrerOrigin = input.referrerOrigin ? new URL(input.referrerOrigin).origin : null;
  const common = {
    consentVersion: VISITOR_INSIGHTS_CONSENT_VERSION,
    consentedAt: now,
    expiresAt: expiresAtFor(settings.visitorInsightsRetentionDays),
    ipAddress: env.STORE_IP_ADDRESSES ? ip : null,
    userAgent: input.userAgent,
    browserName: input.browserName,
    browserVersion: input.browserVersion,
    osName: input.osName,
    osVersion: input.osVersion,
    deviceType: input.deviceType,
    platform: input.platform,
    language: input.language,
    languages: input.languages,
    timezone: input.timezone,
    screenWidth: input.screenWidth,
    screenHeight: input.screenHeight,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    pixelRatio: input.pixelRatio,
    colorDepth: input.colorDepth,
    touchPoints: input.touchPoints,
    hardwareConcurrency: input.hardwareConcurrency,
    deviceMemoryGb: input.deviceMemoryGb,
    connectionType: input.connectionType,
    connectionEffectiveType: input.connectionEffectiveType,
    connectionDownlinkMbps: input.connectionDownlinkMbps,
    connectionRttMs: input.connectionRttMs,
    connectionSaveData: input.connectionSaveData,
    referrerOrigin,
    ...geo,
  } satisfies Omit<Prisma.VisitorInsightUncheckedCreateInput, "anonymousUserId">;
  await prisma.visitorInsight.upsert({
    where: { anonymousUserId },
    create: { anonymousUserId, ...common },
    update: common,
  });
}

export async function revokeVisitorInsights(anonymousUserId: string): Promise<void> {
  await prisma.visitorInsight.deleteMany({ where: { anonymousUserId } });
}

export async function getVisitorInsightForConversation(conversationId: string): Promise<VisitorInsightDto | null> {
  const insight = await prisma.visitorInsight.findFirst({
    where: { anonymousUser: { conversation: { id: conversationId, deletedAt: null } }, expiresAt: { gt: new Date() } },
  });
  return insight ? toVisitorInsightDto(insight) : null;
}

function toVisitorInsightDto(value: VisitorInsight): VisitorInsightDto {
  return {
    consentedAt: value.consentedAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    expiresAt: value.expiresAt.toISOString(),
    ipAddress: value.ipAddress,
    userAgent: value.userAgent,
    browserName: value.browserName,
    browserVersion: value.browserVersion,
    osName: value.osName,
    osVersion: value.osVersion,
    deviceType: value.deviceType,
    platform: value.platform,
    language: value.language,
    languages: Array.isArray(value.languages)
      ? value.languages.filter((item): item is string => typeof item === "string")
      : [],
    timezone: value.timezone,
    screenWidth: value.screenWidth,
    screenHeight: value.screenHeight,
    viewportWidth: value.viewportWidth,
    viewportHeight: value.viewportHeight,
    pixelRatio: value.pixelRatio,
    colorDepth: value.colorDepth,
    touchPoints: value.touchPoints,
    hardwareConcurrency: value.hardwareConcurrency,
    deviceMemoryGb: value.deviceMemoryGb,
    connectionType: value.connectionType,
    connectionEffectiveType: value.connectionEffectiveType,
    connectionDownlinkMbps: value.connectionDownlinkMbps,
    connectionRttMs: value.connectionRttMs,
    connectionSaveData: value.connectionSaveData,
    referrerOrigin: value.referrerOrigin,
    geoCountryCode: value.geoCountryCode,
    geoCountry: value.geoCountry,
    geoRegion: value.geoRegion,
    geoCity: value.geoCity,
    geoPostalCode: value.geoPostalCode,
    geoLatitude: value.geoLatitude,
    geoLongitude: value.geoLongitude,
    geoTimezone: value.geoTimezone,
    networkAsn: value.networkAsn,
    networkOrg: value.networkOrg,
    networkIsp: value.networkIsp,
  };
}

const cleanupTimer = setInterval(() => void pruneExpiredVisitorInsights().catch(() => {}), 60 * 60 * 1_000);
cleanupTimer.unref();
