-- Prepares an upstream Docmost database for docmost-teams.
-- Stop Docmost and back up the database first. See docs/migrating.md.
--
--   docker compose exec -T db psql -U docmost -d docmost < script/migrate-from-upstream.sql
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
  IF EXISTS (
    SELECT 1 FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_type = 'client backend'
  ) THEN
    RAISE WARNING 'Other connections to this database are open. Stop Docmost before switching.';
  END IF;

  -- docmost-teams signs in through OIDC only. Other providers would still
  -- count as active when SSO is enforced.
  FOR r IN
    UPDATE auth_providers SET is_enabled = false
    WHERE type <> 'oidc' AND is_enabled AND deleted_at IS NULL
    RETURNING name, type
  LOOP
    RAISE NOTICE 'SSO provider "%": disabled, docmost-teams has no % sign-in.', r.name, upper(r.type);
  END LOOP;

  -- Enforced SSO refuses password sign-ins, and OIDC sign-in only works once
  -- the identity provider accepts the redirect URI below. Turn it back on
  -- after signing in through SSO works.
  FOR r IN
    UPDATE workspaces SET enforce_sso = false WHERE enforce_sso RETURNING name
  LOOP
    RAISE NOTICE 'Workspace "%": turned off enforced SSO.', r.name;
  END LOOP;

  -- docmost-teams has no SCIM, and skips SSO group sync while it is on.
  -- Group sync only removes memberships it added itself.
  FOR r IN
    UPDATE workspaces SET is_scim_enabled = false WHERE is_scim_enabled RETURNING name
  LOOP
    RAISE NOTICE 'Workspace "%": turned off SCIM.', r.name;
  END LOOP;

  -- Reports only.

  FOR r IN
    SELECT id, name FROM auth_providers
    WHERE type = 'oidc' AND deleted_at IS NULL
    ORDER BY created_at
  LOOP
    RAISE NOTICE 'SSO provider "%": register <APP_URL>/api/sso/oidc/%/callback as its redirect URI.', r.name, r.id;
  END LOOP;

  SELECT count(*) INTO n FROM user_mfa WHERE is_enabled;
  IF n > 0 THEN
    RAISE NOTICE 'Users with MFA: %. docmost-teams does not ask for it at sign-in.', n;
  END IF;

  SELECT count(*) INTO n FROM page_access;
  IF n > 0 THEN
    RAISE NOTICE 'Pages with page-level permissions: %. They stay enforced, but docmost-teams cannot change them.', n;
  END IF;

  SELECT count(*) INTO n FROM shares sh JOIN spaces s ON s.id = sh.space_id
  WHERE s.is_personal;
  IF n > 0 THEN
    RAISE NOTICE 'Share links in personal spaces: %. They stop working, since docmost-teams keeps personal spaces private.', n;
  END IF;
END $$;

\if :{?dry_run}
ROLLBACK;
\echo 'Dry run: nothing was changed.'
\else
COMMIT;
\echo 'Done: changes committed.'
\endif
