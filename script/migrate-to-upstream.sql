-- Prepares a docmost-teams database for upstream Docmost.
-- Stop docmost-teams and back up the database first. See docs/migrating.md.
--
--   docker compose exec -T db psql -U docmost -d docmost < script/migrate-to-upstream.sql
--
-- Add `-v dry_run=1` to list the changes without making them.

\set ON_ERROR_STOP on
\set QUIET on
BEGIN;

DO $$
DECLARE
  r record;
  n bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM kysely_migration
    WHERE name IN (
      '20260710T000000-allow-multiple-private-spaces',
      '20261006T120000-sso-sync-provenance',
      '20261016T120000-sso-explicit-owner-groups'
    )
  ) THEN
    RAISE NOTICE 'No docmost-teams migrations found; nothing to do.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_type = 'client backend'
  ) THEN
    RAISE WARNING 'Other connections to this database are open. Stop docmost-teams before switching.';
  END IF;

  -- Upstream has no SSO without a license, and enforced SSO refuses password
  -- sign-ins. With a license, turn these back on once SSO works there.
  FOR r IN
    UPDATE workspaces SET enforce_sso = false WHERE enforce_sso RETURNING name
  LOOP
    RAISE NOTICE 'Workspace "%": turned off enforced SSO.', r.name;
  END LOOP;

  FOR r IN
    UPDATE auth_providers SET is_enabled = false
    WHERE type = 'oidc' AND is_enabled AND deleted_at IS NULL
    RETURNING name
  LOOP
    RAISE NOTICE 'SSO provider "%": disabled.', r.name;
  END LOOP;

  -- Upstream allows one personal space per member. Each creator keeps the
  -- oldest private space; the others become ordinary spaces with the same
  -- single member.
  FOR r IN
    UPDATE spaces s SET is_personal = false
    WHERE s.is_personal
      AND s.deleted_at IS NULL
      AND s.id <> (
        SELECT s2.id FROM spaces s2
        WHERE s2.creator_id = s.creator_id
          AND s2.is_personal
          AND s2.deleted_at IS NULL
        ORDER BY s2.created_at, s2.id
        LIMIT 1
      )
    RETURNING s.name
  LOOP
    RAISE NOTICE 'Private space "%": now an ordinary space with the same member.', r.name;
  END LOOP;

  CREATE UNIQUE INDEX IF NOT EXISTS spaces_personal_creator_unique
    ON spaces (creator_id)
    WHERE is_personal = true AND deleted_at IS NULL;

  DROP TABLE IF EXISTS sso_role_grants;
  DROP TABLE IF EXISTS sso_group_memberships;

  DELETE FROM kysely_migration
  WHERE name IN (
    '20260710T000000-allow-multiple-private-spaces',
    '20261006T120000-sso-sync-provenance',
    '20261016T120000-sso-explicit-owner-groups'
  );

  -- Reports only.

  -- Upstream gives workspace owners no access to spaces they aren't members of.
  FOR r IN
    SELECT s.name FROM spaces s
    WHERE s.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM space_members sm
        LEFT JOIN group_users gu ON gu.group_id = sm.group_id
        WHERE sm.space_id = s.id
          AND sm.role = 'admin'
          AND (sm.user_id IS NOT NULL OR gu.user_id IS NOT NULL)
      )
    ORDER BY s.name
  LOOP
    RAISE NOTICE 'Space "%" has no space admin, and upstream does not let workspace owners manage it.', r.name;
  END LOOP;

  SELECT count(*) INTO n FROM users u
  WHERE u.deleted_at IS NULL
    AND u.has_generated_password
    AND EXISTS (SELECT 1 FROM auth_accounts a WHERE a.user_id = u.id);
  IF n > 0 THEN
    RAISE NOTICE 'SSO users without a password: %. They need "Forgot password", which needs email set up.', n;
  END IF;
END $$;

\if :{?dry_run}
ROLLBACK;
\echo 'Dry run: nothing was changed.'
\else
COMMIT;
\echo 'Done: changes committed.'
\endif
