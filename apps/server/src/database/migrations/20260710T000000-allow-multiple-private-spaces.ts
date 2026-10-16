import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('spaces_personal_creator_unique')
    .ifExists()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // A rollback is only safe when no creator has more than one private space.
  await sql`
    CREATE UNIQUE INDEX spaces_personal_creator_unique
    ON spaces (creator_id)
    WHERE is_personal = true AND deleted_at IS NULL
  `.execute(db);
}
