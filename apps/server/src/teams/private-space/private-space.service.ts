import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { Space } from '@docmost/db/types/entity.types';
import { sql } from 'kysely';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { Inject } from '@nestjs/common';

@Injectable()
export class PrivateSpaceService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async convertSpace(
    spaceId: string,
    workspaceId: string,
    isPersonal: boolean,
  ): Promise<Space> {
    let updatedSpace: Space;
    let previousCreatorId: string | null | undefined;
    let changed = false;

    await executeTx(this.db, async (trx) => {
      const space = await trx
        .selectFrom('spaces')
        .selectAll()
        .where('id', '=', spaceId)
        .where('workspaceId', '=', workspaceId)
        .forUpdate()
        .executeTakeFirst();

      if (!space) {
        throw new NotFoundException('Space not found');
      }

      if (space.isPersonal === isPersonal) {
        updatedSpace = space;
        return;
      }

      changed = true;
      previousCreatorId = space.creatorId;
      let creatorId = space.creatorId;

      if (isPersonal) {
        const members = await trx
          .selectFrom('spaceMembers')
          .select(['userId', 'groupId'])
          .where('spaceId', '=', space.id)
          .forUpdate()
          .execute();

        if (members.length !== 1 || !members[0].userId || members[0].groupId) {
          throw new BadRequestException(
            'A space can only be made personal when it has exactly one direct user member.',
          );
        }

        creatorId = members[0].userId;

        await trx
          .deleteFrom('shares')
          .where('spaceId', '=', space.id)
          .execute();
      }

      updatedSpace = await trx
        .updateTable('spaces')
        .set({
          isPersonal,
          creatorId,
          ...(isPersonal
            ? {
                settings: sql`COALESCE(settings, '{}'::jsonb)
                  || jsonb_build_object('sharing', COALESCE(settings->'sharing', '{}'::jsonb)
                  || jsonb_build_object('disabled', true))`,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where('id', '=', space.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    if (!changed) {
      return updatedSpace;
    }

    this.auditService.log({
      event: AuditEvent.SPACE_UPDATED,
      resourceType: AuditResource.SPACE,
      resourceId: updatedSpace.id,
      spaceId: updatedSpace.id,
      changes: {
        before: {
          isPersonal: !isPersonal,
          ...(isPersonal && previousCreatorId !== updatedSpace.creatorId
            ? { creatorId: previousCreatorId }
            : {}),
        },
        after: {
          isPersonal,
          ...(isPersonal && previousCreatorId !== updatedSpace.creatorId
            ? { creatorId: updatedSpace.creatorId }
            : {}),
        },
      },
    });

    return updatedSpace;
  }
}
