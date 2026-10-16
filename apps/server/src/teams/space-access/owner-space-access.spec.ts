import {
  CamelCasePlugin,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  ownerAccessibleSpaceIdsQuery,
  ownerSpaceRoleQuery,
  ownerSpaceRolesQuery,
  ownersWithSpaceAccessQuery,
} from './owner-space-access';

// Compiles the queries the way the app does (Postgres, camelCase plugin)
// without a database, to pin the rules they encode.
const db = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  plugins: [new CamelCasePlugin()],
}) as unknown as KyselyDB;

describe('owner space access', () => {
  it('grants owners the admin role on ordinary spaces only', () => {
    const { sql, parameters } = ownerSpaceRoleQuery(
      db,
      'user-1',
      'space-1',
    ).compile();

    expect(sql).toContain(`'admin' as "role"`);
    expect(sql).toContain('"users"."role" = $');
    expect(sql).toContain('"spaces"."is_personal" = $');
    expect(parameters).toEqual(['user-1', 'owner', 'space-1', false]);
  });

  it('grants the same role across a list of spaces', () => {
    const { sql, parameters } = ownerSpaceRolesQuery(db, 'user-1', [
      'space-1',
      'space-2',
    ]).compile();

    expect(sql).toContain(`"spaces"."id" as "space_id"`);
    expect(sql).toContain(`'admin' as "role"`);
    expect(parameters).toEqual(['user-1', 'owner', 'space-1', 'space-2', false]);
  });

  it('never reaches private spaces through workspace ownership', () => {
    for (const query of [
      ownerAccessibleSpaceIdsQuery(db, 'user-1'),
      ownersWithSpaceAccessQuery(db, 'space-1'),
    ]) {
      const { sql, parameters } = query.compile();
      expect(sql).toContain('"spaces"."is_personal" = $');
      expect(sql).toContain('"users"."role" = $');
      expect(parameters).toContain('owner');
      expect(parameters).toContain(false);
    }
  });
});
