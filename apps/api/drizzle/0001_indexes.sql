-- ---------------------------------------------------------------------------
-- Bright Memo v2 — Migration 0001: specialised indexes
--
-- The schema migration (0000) already creates the basic btree indexes needed
-- for FK lookups. This file adds:
--   * HNSW index for cosine-distance similarity search on embeddings
--   * GIN index for fast tag filtering on memories
--   * Extra btree indexes that the query planner prefers for our access
--     patterns (project_id + created_at DESC is the default memories feed;
--     api_keys user_id is the "list my keys" query)
-- ---------------------------------------------------------------------------

-- 1. Vector similarity (pgvector). Cosine distance is the default for the
--    OpenAI / Voyage / similar text-embedding-3 models.
CREATE INDEX IF NOT EXISTS "memories_embedding_hnsw_idx"
  ON "memories" USING hnsw ("embedding" vector_cosine_ops);

-- 2. Tag array filtering (e.g. WHERE tags @> ARRAY['postgres']).
CREATE INDEX IF NOT EXISTS "memories_tags_gin_idx"
  ON "memories" USING gin ("tags");

-- 3. Composite for the most common memories feed query:
--    SELECT * FROM memories WHERE project_id = $1 ORDER BY created_at DESC
--    Drizzle's previous btree was (project_id, created_at ASC) — we want DESC
--    so a single index walk returns rows in the right order.
DROP INDEX IF EXISTS "memories_project_created_idx";
CREATE INDEX IF NOT EXISTS "memories_project_created_desc_idx"
  ON "memories" ("project_id", "created_at" DESC);

-- 4. Already covered by FK index, but kept explicit for clarity / planner.
CREATE INDEX IF NOT EXISTS "memories_user_id_idx"
  ON "memories" ("user_id");

-- 5. The CLI uses cwd_alias to look up projects before scoping any
--    memories. The schema's composite (user_id, cwd_alias) already covers
--    this when both are supplied; add a single-column index for the
--    "do I already have this alias?" warmup.
CREATE INDEX IF NOT EXISTS "projects_cwd_alias_idx"
  ON "projects" ("cwd_alias");

-- 6. "List my API keys" — sort by created_at desc.
CREATE INDEX IF NOT EXISTS "api_keys_user_id_created_idx"
  ON "api_keys" ("user_id", "created_at" DESC);