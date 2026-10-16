import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { WatcherRepo } from '@docmost/db/repos/watcher/watcher.repo';
import { FavoriteRepo } from '@docmost/db/repos/favorite/favorite.repo';
import { UserRole } from '../../common/helpers/types/permission';
import { SsoDB, SsoTransaction } from './sso-sync.types';
import { normalizeRole, planGroupSync, planRoleSync } from './sso-sync.plan';

type GroupRef = { id: string; name: string; isDefault: boolean };

@Injectable()
export class SsoSyncService {
  private readonly logger = new Logger(SsoSyncService.name);
  private readonly db: SsoDB;

  constructor(
    @InjectKysely() db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly watcherRepo: WatcherRepo,
    private readonly favoriteRepo: FavoriteRepo,
  ) {
    this.db = db as unknown as SsoDB;
  }

  /**
   * Makes the user's provider-assigned memberships match `groupNames`,
   * creating missing groups. See planGroupSync for what is left alone.
   */
  async syncGroupMemberships(opts: {
    userId: string;
    workspaceId: string;
    providerId: string;
    creatorId: string | null;
    groupNames: string[];
  }): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const desiredGroupIds = new Set<string>();
      const groupsByName = await this.loadGroupsByName(trx, opts.workspaceId);

      for (const name of opts.groupNames) {
        const group = await this.findOrCreateGroup(trx, groupsByName, {
          name,
          workspaceId: opts.workspaceId,
          creatorId: opts.creatorId,
        });
        if (group && !group.isDefault) {
          desiredGroupIds.add(group.id);
        }
      }

      const memberships = await trx
        .selectFrom('groupUsers')
        .innerJoin('groups', 'groups.id', 'groupUsers.groupId')
        .leftJoin(
          'ssoGroupMemberships',
          'ssoGroupMemberships.groupUserId',
          'groupUsers.id',
        )
        .select([
          'groupUsers.id as groupUserId',
          'groupUsers.groupId',
          'ssoGroupMemberships.groupUserId as trackedGroupUserId',
          'ssoGroupMemberships.authProviderId',
        ])
        .where('groupUsers.userId', '=', opts.userId)
        .where('groups.workspaceId', '=', opts.workspaceId)
        .where('groups.deletedAt', 'is', null)
        .execute();

      const plan = planGroupSync({
        desiredGroupIds,
        providerId: opts.providerId,
        memberships: memberships.map((m) => ({
          groupUserId: m.groupUserId,
          groupId: m.groupId,
          tracked: m.trackedGroupUserId !== null,
          authProviderId: m.authProviderId,
        })),
      });

      for (const groupId of plan.addGroupIds) {
        const inserted = await trx
          .insertInto('groupUsers')
          .values({ userId: opts.userId, groupId })
          .onConflict((oc) => oc.columns(['groupId', 'userId']).doNothing())
          .returning('id')
          .executeTakeFirst();

        if (inserted) {
          await trx
            .insertInto('ssoGroupMemberships')
            .values({
              groupUserId: inserted.id,
              authProviderId: opts.providerId,
              workspaceId: opts.workspaceId,
            })
            .execute();
        }
      }

      if (plan.adoptGroupUserIds.length > 0) {
        await trx
          .updateTable('ssoGroupMemberships')
          .set({ authProviderId: opts.providerId })
          .where('groupUserId', 'in', plan.adoptGroupUserIds)
          .execute();
      }

      if (plan.remove.length === 0) {
        return;
      }

      await trx
        .deleteFrom('groupUsers')
        .where(
          'id',
          'in',
          plan.remove.map((m) => m.groupUserId),
        )
        .execute();

      const affectedSpaces = await trx
        .selectFrom('spaceMembers')
        .select('spaceId')
        .distinct()
        .where(
          'groupId',
          'in',
          plan.remove.map((m) => m.groupId),
        )
        .execute();

      const repoTrx = trx as unknown as KyselyTransaction;
      for (const { spaceId } of affectedSpaces) {
        await this.watcherRepo.deleteByUsersWithoutSpaceAccess(
          [opts.userId],
          spaceId,
          { trx: repoTrx },
        );
        await this.favoriteRepo.deleteByUsersWithoutSpaceAccess(
          [opts.userId],
          spaceId,
          { trx: repoTrx },
        );
      }
    });
  }

  /**
   * Applies the role mapped from the provider's groups. See planRoleSync for
   * the rules; additionally the last active owner is never demoted.
   */
  async syncRole(opts: {
    userId: string;
    workspaceId: string;
    providerId: string;
    mappedRole: UserRole | null;
  }): Promise<UserRole | null> {
    return this.db.transaction().execute(async (trx) => {
      const repoTrx = trx as unknown as KyselyTransaction;
      // Serializes owner-count checks with upstream role changes.
      await this.workspaceRepo.findById(opts.workspaceId, {
        withLock: true,
        trx: repoTrx,
      });

      const user = await trx
        .selectFrom('users')
        .select(['id', 'role'])
        .where('id', '=', opts.userId)
        .where('workspaceId', '=', opts.workspaceId)
        .executeTakeFirst();
      if (!user) return null;

      const currentRole = normalizeRole(user.role);
      const grant = await trx
        .selectFrom('ssoRoleGrants')
        .select(['role', 'previousRole', 'authProviderId'])
        .where('userId', '=', opts.userId)
        .executeTakeFirst();

      const plan = planRoleSync({
        currentRole: user.role,
        grant: grant ?? null,
        mappedRole: opts.mappedRole,
        providerId: opts.providerId,
      });
      if (plan.kind === 'skip') {
        return currentRole;
      }

      if (plan.targetRole !== currentRole) {
        if (
          currentRole === UserRole.OWNER &&
          (await this.userRepo.roleCountByWorkspaceId(
            UserRole.OWNER,
            opts.workspaceId,
            repoTrx,
          )) <= 1
        ) {
          this.logger.warn(
            `Kept owner role for user ${opts.userId}: they are the last workspace owner.`,
          );
          return currentRole;
        }

        await this.userRepo.updateUser(
          { role: plan.targetRole },
          opts.userId,
          opts.workspaceId,
          repoTrx,
        );
      }

      if (plan.grant) {
        await trx
          .insertInto('ssoRoleGrants')
          .values({
            userId: opts.userId,
            authProviderId: opts.providerId,
            workspaceId: opts.workspaceId,
            role: plan.grant.role,
            previousRole: plan.grant.previousRole,
          })
          .onConflict((oc) =>
            oc.column('userId').doUpdateSet({
              authProviderId: opts.providerId,
              role: plan.grant.role,
              previousRole: plan.grant.previousRole,
              updatedAt: new Date(),
            }),
          )
          .execute();
      } else if (grant) {
        await trx
          .deleteFrom('ssoRoleGrants')
          .where('userId', '=', opts.userId)
          .execute();
      }

      return plan.targetRole;
    });
  }

  private async loadGroupsByName(trx: SsoTransaction, workspaceId: string) {
    const groups = await trx
      .selectFrom('groups')
      .select(['id', 'name', 'isDefault'])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();

    return new Map<string, GroupRef>(
      groups.map((group) => [group.name.trim().toLowerCase(), group]),
    );
  }

  private async findOrCreateGroup(
    trx: SsoTransaction,
    groupsByName: Map<string, GroupRef>,
    opts: { name: string; workspaceId: string; creatorId: string | null },
  ): Promise<GroupRef | null> {
    const key = opts.name.toLowerCase();
    const existing = groupsByName.get(key);
    if (existing) return existing;

    const created = await trx
      .insertInto('groups')
      .values({
        name: opts.name,
        description: null,
        isDefault: false,
        isExternal: true,
        creatorId: opts.creatorId,
        workspaceId: opts.workspaceId,
        deletedAt: null,
        scimExternalId: null,
      })
      // Names are unique per workspace regardless of case, so any conflict
      // counts, not just one on the exact name.
      .onConflict((oc) => oc.doNothing())
      .returning(['id', 'name', 'isDefault'])
      .executeTakeFirst();

    // On a conflict, another sign-in may have just created the group.
    const group =
      created ??
      (await trx
        .selectFrom('groups')
        .select(['id', 'name', 'isDefault'])
        .where('workspaceId', '=', opts.workspaceId)
        .where(sql`lower(name)`, '=', key)
        .where('deletedAt', 'is', null)
        .executeTakeFirst());

    if (!group) {
      // The name belongs to a deleted group. The unique constraint still
      // covers it, and reviving a group an admin deleted is not sync's call.
      this.logger.warn(
        `Skipped syncing group "${opts.name}": a deleted group with that name exists.`,
      );
      return null;
    }

    groupsByName.set(key, group);
    return group;
  }
}
