CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "embedding" DROP NOT NULL;--> statement-breakpoint
UPDATE "memories"
SET "embedding" = NULL
WHERE "embedding" IS NOT NULL
  AND vector_norm("embedding") = 0;--> statement-breakpoint
CREATE INDEX "memories_content_fts_idx" ON "memories" USING gin (to_tsvector('simple', "content"));--> statement-breakpoint
CREATE INDEX "memories_content_trgm_idx" ON "memories" USING gin ("content" gin_trgm_ops);
