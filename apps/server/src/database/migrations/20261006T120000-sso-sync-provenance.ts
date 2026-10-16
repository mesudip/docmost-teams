import { type Kysely, sql } from 'kysely';

// docmost-teams: records which group memberships and roles were assigned by
// an SSO provider, so sync only revokes what a provider granted.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('sso_group_memberships')
    .addColumn('group_user_id', 'uuid', (col) =>
      col.primaryKey().references('group_users.id').onDelete('cascade'),
    )
    .addColumn('auth_provider_id', 'uuid', (col) =>
      col.references('auth_providers.id').onDelete('set null'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_sso_group_memberships_auth_provider_id')
    .on('sso_group_memberships')
    .column('auth_provider_id')
    .execute();

  await db.schema
    .createTable('sso_role_grants')
    .addColumn('user_id', 'uuid', (col) =>
      col.primaryKey().references('users.id').onDelete('cascade'),
    )
    .addColumn('auth_provider_id', 'uuid', (col) =>
      col.references('auth_providers.id').onDelete('set null'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('role', 'varchar', (col) => col.notNull())
    .addColumn('previous_role', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Before this migration, OIDC group sync pruned every membership of a
  // non-default external group, so those memberships stay provider-managed.
  // They are attributed to the workspace's group-sync provider when there is
  // exactly one; otherwise the next provider that syncs adopts them.
  await sql`
    INSERT INTO sso_group_memberships (group_user_id, auth_provider_id, workspace_id)
    SELECT
      gu.id,
      (
        SELECT CASE WHEN count(*) = 1 THEN (array_agg(ap.id))[1] END
        FROM auth_providers ap
        WHERE ap.workspace_id = g.workspace_id
          AND ap.type = 'oidc'
          AND ap.group_sync = true
          AND ap.deleted_at IS NULL
      ),
      g.workspace_id
    FROM group_users gu
    JOIN groups g ON g.id = gu.group_id
    JOIN workspaces w ON w.id = g.workspace_id
    WHERE g.is_external = true
      AND g.is_default = false
      AND g.deleted_at IS NULL
      AND w.is_scim_enabled = false
      AND EXISTS (
        SELECT 1 FROM auth_providers ap
        WHERE ap.workspace_id = g.workspace_id
          AND ap.type = 'oidc'
          AND ap.group_sync = true
          AND ap.deleted_at IS NULL
      )
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('sso_role_grants').execute();
  await db.schema.dropTable('sso_group_memberships').execute();
}
