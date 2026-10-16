import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';

// docmost-teams: pages in private spaces are never shared publicly.

/** Deletes the public shares of pages that were just moved into `spaceId`, if it is private. */
export async function deleteSharesInPrivateSpace(
  db: KyselyDB | KyselyTransaction,
  spaceId: string,
  pageIds: string[],
): Promise<void> {
  if (pageIds.length === 0) return;

  await db
    .deleteFrom('shares')
    .where('pageId', 'in', pageIds)
    .where('spaceId', 'in', (eb) =>
      eb
        .selectFrom('spaces')
        .select('spaces.id')
        .where('spaces.id', '=', spaceId)
        .where('spaces.isPersonal', '=', true),
    )
    .execute();
}

/**
 * Whether shares in a space may answer anonymous requests: the same rule as
 * upstream's ShareService.isSharingAllowed with the fork's private-space
 * check, for code paths that can't reach that service.
 */
export async function isSharingAllowedInSpace(
  db: KyselyDB | KyselyTransaction,
  workspaceId: string,
  spaceId: string,
): Promise<boolean> {
  const result = await db
    .selectFrom('workspaces')
    .innerJoin('spaces', 'spaces.workspaceId', 'workspaces.id')
    .select([
      'workspaces.settings as workspaceSettings',
      'spaces.settings as spaceSettings',
      'spaces.isPersonal as isPersonal',
    ])
    .where('workspaces.id', '=', workspaceId)
    .where('spaces.id', '=', spaceId)
    .executeTakeFirst();

  if (!result) return false;

  const workspaceDisabled =
    (result.workspaceSettings as any)?.sharing?.disabled === true;
  const spaceDisabled = (result.spaceSettings as any)?.sharing?.disabled === true;

  return !result.isPersonal && !workspaceDisabled && !spaceDisabled;
}
