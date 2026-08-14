CREATE TABLE "conversation_notes" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contentCiphertext" BYTEA NOT NULL,
    "contentNonce" BYTEA NOT NULL,
    "updatedBy" "SenderType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversation_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "note_assets" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "metaCiphertext" BYTEA NOT NULL,
    "metaNonce" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "note_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_notes_conversationId_key" ON "conversation_notes"("conversationId");
CREATE UNIQUE INDEX "note_assets_storageKey_key" ON "note_assets"("storageKey");
CREATE INDEX "note_assets_conversationId_idx" ON "note_assets"("conversationId");

ALTER TABLE "conversation_notes"
ADD CONSTRAINT "conversation_notes_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_assets"
ADD CONSTRAINT "note_assets_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
