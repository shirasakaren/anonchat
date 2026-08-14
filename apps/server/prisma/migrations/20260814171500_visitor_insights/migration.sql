ALTER TABLE "site_settings"
ADD COLUMN "visitorInsightsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "visitorInsightsRetentionDays" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE "visitor_insights" (
    "id" TEXT NOT NULL,
    "anonymousUserId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL DEFAULT '2026-08-14',
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "deviceType" TEXT,
    "platform" TEXT,
    "language" TEXT,
    "languages" JSONB NOT NULL DEFAULT '[]',
    "timezone" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "pixelRatio" DOUBLE PRECISION,
    "colorDepth" INTEGER,
    "touchPoints" INTEGER,
    "hardwareConcurrency" INTEGER,
    "deviceMemoryGb" DOUBLE PRECISION,
    "connectionType" TEXT,
    "connectionEffectiveType" TEXT,
    "connectionDownlinkMbps" DOUBLE PRECISION,
    "connectionRttMs" INTEGER,
    "connectionSaveData" BOOLEAN,
    "referrerOrigin" TEXT,
    "geoCountryCode" TEXT,
    "geoCountry" TEXT,
    "geoRegion" TEXT,
    "geoCity" TEXT,
    "geoPostalCode" TEXT,
    "geoLatitude" DOUBLE PRECISION,
    "geoLongitude" DOUBLE PRECISION,
    "geoTimezone" TEXT,
    "networkAsn" INTEGER,
    "networkOrg" TEXT,
    "networkIsp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "visitor_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visitor_insights_anonymousUserId_key" ON "visitor_insights"("anonymousUserId");
CREATE INDEX "visitor_insights_expiresAt_idx" ON "visitor_insights"("expiresAt");

ALTER TABLE "visitor_insights"
ADD CONSTRAINT "visitor_insights_anonymousUserId_fkey"
FOREIGN KEY ("anonymousUserId") REFERENCES "anonymous_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
