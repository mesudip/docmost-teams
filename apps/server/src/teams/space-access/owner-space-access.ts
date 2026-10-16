import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { SpaceRole, UserRole } from '../../common/helpers/types/permission';

// docmost-teams: workspace owners administer every ordinary space in their
// workspace without being members (see SpaceAbilityFactory). Upstream
// derives "spaces a user can reach" from membership alone, so these
// queries are unioned into those membership queries. Personal spaces stay
// limited to their creator.

/** Ordinary spaces the user can reach as a workspace owner. */
export function ownerAccessibleSpaceIdsQuery(
  db: KyselyDB | KyselyTransaction,
  userId: string,
) {
  return db
    .selectFrom('spaces')
    .innerJoin('users', 'users.workspaceId', 'spaces.workspaceId')
    .select('spaces.id')
    .where('users.id', '=', userId)
    .where('users.role', '=', UserRole.OWNER)
    .where('spaces.isPersonal', '=', false);
}

/**
 * A space admin role row for the user when they own the workspace and the
 * space is ordinary, in the shape of upstream's space role queries.
 */
export function ownerSpaceRoleQuery(
  db: KyselyDB | KyselyTransaction,
  userId: string,
  spaceId: string,
) {
  return db
    .selectFrom('users')
    .innerJoin('spaces', 'spaces.workspaceId', 'users.workspaceId')
    .select([
      'users.id as userId',
      sql.lit<string>(SpaceRole.ADMIN).as('role'),
    ])
    .where('users.id', '=', userId)
    .where('users.role', '=', UserRole.OWNER)
    .where('spaces.id', '=', spaceId)
    .where('spaces.isPersonal', '=', false);
}

/**
 * Space admin role rows for the ordinary spaces among `spaceIds` when the user
 * owns the workspace, in the shape of upstream's per-space role queries.
 */
export function ownerSpaceRolesQuery(
  db: KyselyDB | KyselyTransaction,
  userId: string,
  spaceIds: string[],
) {
  return db
    .selectFrom('users')
    .innerJoin('spaces', 'spaces.workspaceId', 'users.workspaceId')
    .select(['spaces.id as spaceId', sql.lit<string>(SpaceRole.ADMIN).as('role')])
    .where('users.id', '=', userId)
    .where('users.role', '=', UserRole.OWNER)
    .where('spaces.id', 'in', spaceIds)
    .where('spaces.isPersonal', '=', false);
}

/** Owners who can reach the space without membership. */
export function ownersWithSpaceAccessQuery(
  db: KyselyDB | KyselyTransaction,
  spaceId: string,
) {
  return db
    .selectFrom('users')
    .innerJoin('spaces', 'spaces.workspaceId', 'users.workspaceId')
    .select('users.id as userId')
    .where('spaces.id', '=', spaceId)
    .where('spaces.isPersonal', '=', false)
    .where('users.role', '=', UserRole.OWNER);
}
