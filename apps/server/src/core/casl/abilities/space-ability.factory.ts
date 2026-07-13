import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { SpaceRole, UserRole } from '../../../common/helpers/types/permission';
import { User } from '@docmost/db/types/entity.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import {
  SpaceCaslAction,
  ISpaceAbility,
  SpaceCaslSubject,
} from '../interfaces/space-ability.type';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';

@Injectable()
export default class SpaceAbilityFactory {
  constructor(
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceRepo: SpaceRepo,
  ) {}

  async createForUser(user: User, spaceId: string) {
    const space = await this.spaceRepo.findById(spaceId, user.workspaceId);
    if (!space) {
      throw new NotFoundException('Space permissions not found');
    }

    if (space.isPersonal && space.creatorId !== user.id) {
      throw new NotFoundException('Space permissions not found');
    }

    // Personal spaces are private to their creator. Workspace ownership,
    // including ownership granted through the Root SSO group, never bypasses this.
    if (user.role === UserRole.OWNER && !space.isPersonal) {
      return buildSpaceAdminAbility();
    }

    const userSpaceRoles = await this.spaceMemberRepo.getUserSpaceRoles(
      user.id,
      spaceId,
    );

    const userSpaceRole = findHighestUserSpaceRole(userSpaceRoles);

    return buildAbilityForRole(userSpaceRole);
  }
}

function buildAbilityForRole(userSpaceRole: string | undefined) {
  switch (userSpaceRole) {
    case SpaceRole.ADMIN:
      return buildSpaceAdminAbility();
    case SpaceRole.WRITER:
      return buildSpaceWriterAbility();
    case SpaceRole.READER:
      return buildSpaceReaderAbility();
    default:
      throw new NotFoundException('Space permissions not found');
  }
}

function buildSpaceAdminAbility() {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Member);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Share);
  return build();
}

function buildSpaceWriterAbility() {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  can(SpaceCaslAction.Read, SpaceCaslSubject.Settings);
  can(SpaceCaslAction.Read, SpaceCaslSubject.Member);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);
  can(SpaceCaslAction.Manage, SpaceCaslSubject.Share);
  return build();
}

function buildSpaceReaderAbility() {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  can(SpaceCaslAction.Read, SpaceCaslSubject.Settings);
  can(SpaceCaslAction.Read, SpaceCaslSubject.Member);
  can(SpaceCaslAction.Read, SpaceCaslSubject.Page);
  can(SpaceCaslAction.Read, SpaceCaslSubject.Share);
  return build();
}
