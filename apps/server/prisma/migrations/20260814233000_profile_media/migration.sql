-- Replace database-embedded profile-photo arrays with storage-backed media
-- records while preserving every existing photo as a legacy inline record.
CREATE TYPE "ProfileMediaKind" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "profile_media" (
    "id" TEXT NOT NULL,
    "kind" "ProfileMediaKind" NOT NULL,
    "mimetype" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT,
    "inlineDataUrl" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profile_media_has_content" CHECK (
      ("storageKey" IS NOT NULL AND "inlineDataUrl" IS NULL)
      OR ("storageKey" IS NULL AND "inlineDataUrl" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "profile_media_storageKey_key" ON "profile_media"("storageKey");
CREATE INDEX "profile_media_position_createdAt_idx" ON "profile_media"("position", "createdAt");

WITH legacy_media AS (
  SELECT
    item.value #>> '{}' AS data_url,
    (item.ordinality - 1)::INTEGER AS position
  FROM "site_settings" AS settings
  CROSS JOIN LATERAL jsonb_array_elements(settings."profilePhotosJson")
    WITH ORDINALITY AS item(value, ordinality)
  WHERE jsonb_typeof(item.value) = 'string'
)
INSERT INTO "profile_media" (
  "id",
  "kind",
  "mimetype",
  "filename",
  "sizeBytes",
  "storageKey",
  "inlineDataUrl",
  "position"
)
SELECT
  'legacy_' || md5(data_url || position::TEXT),
  'IMAGE'::"ProfileMediaKind",
  CASE
    WHEN data_url LIKE 'data:image/gif;%' THEN 'image/gif'
    WHEN data_url LIKE 'data:image/webp;%' THEN 'image/webp'
    WHEN data_url LIKE 'data:image/jpeg;%' THEN 'image/jpeg'
    ELSE 'image/png'
  END,
  'profile-image-' || (position + 1)::TEXT || CASE
    WHEN data_url LIKE 'data:image/gif;%' THEN '.gif'
    WHEN data_url LIKE 'data:image/webp;%' THEN '.webp'
    WHEN data_url LIKE 'data:image/jpeg;%' THEN '.jpg'
    ELSE '.png'
  END,
  GREATEST(0, FLOOR(LENGTH(SPLIT_PART(data_url, ',', 2)) * 0.75)::INTEGER),
  NULL,
  data_url,
  position
FROM legacy_media;

ALTER TABLE "site_settings" DROP COLUMN "profilePhotosJson";
