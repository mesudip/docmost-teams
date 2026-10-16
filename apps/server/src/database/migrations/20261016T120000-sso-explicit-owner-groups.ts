import { type Kysely, sql } from 'kysely';

// docmost-teams: OIDC providers with group sync, configured before role
// mapping existed, promoted members of the "Root" group to workspace owner.
// New providers map no groups to roles by default, so those providers get
// that rule stored explicitly, where owners can see and change it.
// Providers from upstream Docmost never had that rule. Such a database
// applies the first docmost-teams migration in this same transaction.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE auth_providers
    SET settings = jsonb_set(
      CASE
        WHEN jsonb_typeof(settings) = 'object' THEN settings
        ELSE '{}'::jsonb
      END,
      '{ownerGroups}',
      '["Root"]'::jsonb
    )
    WHERE type = 'oidc'
      AND group_sync = true
      AND (
        settings IS NULL
        OR jsonb_typeof(settings) <> 'object'
        OR NOT settings ? 'ownerGroups'
      )
      AND EXISTS (
        SELECT 1 FROM kysely_migration m
        WHERE m.name = '20260710T000000-allow-multiple-private-spaces'
          AND m.xmin::text::bigint <> pg_current_xact_id()::text::bigint % 4294967296
      )
  `.execute(db);
}

export async function down(): Promise<void> {
  // Stored owner groups stay; they match what the previous default granted.
}
