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
-- `db:deploy` provisions `bright_service` with `BYPASSRLS` so /auth/keys
-- and the bootstrap script can mint new users / API keys without RLS.
-- ---------------------------------------------------------------------------

-- 1. `db:deploy` creates/rotates both login roles from APP_DATABASE_URL and
--    SERVICE_DATABASE_URL before applying migrations. Passwords never live in
--    migration files. This migration owns privileges and RLS attributes.

-- 1a-bis. Belt-and-suspenders: explicitly enforce NOBYPASSRLS on bright_app.
--         Idempotent — Postgres' ALTER ROLE is a no-op when the attribute is
--         already set as requested. Safe to run on every migration.
ALTER ROLE bright_app NOBYPASSRLS;

-- 1a. Service role needs table privileges — BYPASSRLS only skips the
--     row-filter, it doesn't grant DML. Anything that goes through the
--     service connection must be allowed at the ACL level too.
GRANT USAGE ON SCHEMA public TO bright_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "users", "api_keys", "projects", "memories" TO bright_service;

-- 1b. App role runs normal request queries. It has DML privileges but no
--     BYPASSRLS, so policies below are enforced for every req.db query.
GRANT USAGE ON SCHEMA public TO bright_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "users", "api_keys", "projects", "memories" TO bright_app;

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
  USING       (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK  (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- 4. Everything else filters on `user_id`. NULLIF handles both a missing
--    GUC and the empty value left after SET LOCAL, so no context sees no rows.
DROP POLICY IF EXISTS "user_all" ON "api_keys";
CREATE POLICY "user_all" ON "api_keys"
  FOR ALL
  USING       (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK  (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

DROP POLICY IF EXISTS "user_all" ON "projects";
CREATE POLICY "user_all" ON "projects"
  FOR ALL
  USING       (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK  (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

DROP POLICY IF EXISTS "user_all" ON "memories";
CREATE POLICY "user_all" ON "memories"
  FOR ALL
  USING       (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK  (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
