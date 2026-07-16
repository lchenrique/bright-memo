-- ---------------------------------------------------------------------------
-- Bright Memo v2 — Migration 0002: Row-Level Security
--
-- All data tables are scoped to a single user. Every request hits the API
-- with a Postgres session that has `app.current_user_id` set via
-- `SELECT set_config('app.current_user_id', $1, true)`. The policies below
-- filter rows on that GUC so users can never see each other's data.
--
-- We also `FORCE ROW LEVEL SECURITY` so the policies apply to the table
-- owner too — otherwise the bright superuser would bypass RLS by default.
-- The `bright_service` role is created with `BYPASSRLS` so /auth/keys and
-- the bootstrap script can mint new users / API keys without RLS.
-- ---------------------------------------------------------------------------

-- 1. Service role: used by the API bootstrap and the /auth/keys endpoints.
--    BYPASSRLS means it sees every row regardless of policies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bright_service') THEN
    CREATE ROLE bright_service BYPASSRLS LOGIN PASSWORD 'changeme';
  END IF;
END
$$;

-- 1a. Service role needs table privileges — BYPASSRLS only skips the
--     row-filter, it doesn't grant DML. Anything that goes through the
--     service connection must be allowed at the ACL level too.
GRANT USAGE ON SCHEMA public TO bright_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "users", "api_keys", "projects", "memories" TO bright_service;

-- 2. Enable + force RLS on every data table.
ALTER TABLE "users"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"    FORCE  ROW LEVEL SECURITY;
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memories" FORCE  ROW LEVEL SECURITY;

-- 3. Users can only see / mutate their own row. The user table has no
--    `user_id` column — `id` IS the ownership column.
DROP POLICY IF EXISTS "user_all" ON "users";
CREATE POLICY "user_all" ON "users"
  FOR ALL
  USING       (id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK  (id = current_setting('app.current_user_id', true)::uuid);

-- 4. Everything else filters on `user_id`. The `current_setting(..., true)`
--    form returns NULL on missing GUC instead of raising — `NULL::uuid`
--    never matches a row, so an unset user_id can never see data.
DROP POLICY IF EXISTS "user_all" ON "api_keys";
CREATE POLICY "user_all" ON "api_keys"
  FOR ALL
  USING       (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK  (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS "user_all" ON "projects";
CREATE POLICY "user_all" ON "projects"
  FOR ALL
  USING       (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK  (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS "user_all" ON "memories";
CREATE POLICY "user_all" ON "memories"
  FOR ALL
  USING       (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK  (user_id = current_setting('app.current_user_id', true)::uuid);