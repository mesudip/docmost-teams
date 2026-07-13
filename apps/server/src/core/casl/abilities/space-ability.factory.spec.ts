import { NotFoundException } from '@nestjs/common';
import { SpaceRole, UserRole } from '../../../common/helpers/types/permission';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../interfaces/space-ability.type';
import SpaceAbilityFactory from './space-ability.factory';

describe('SpaceAbilityFactory', () => {
  it('gives workspace owners full administration of ordinary spaces without membership', async () => {
    const spaceMemberRepo = {
      getUserSpaceRoles: jest.fn(),
    };
    const spaceRepo = {
      findById: jest.fn().mockResolvedValue({ isPersonal: false }),
    };
    const factory = new SpaceAbilityFactory(
      spaceMemberRepo as never,
      spaceRepo as never,
    );

    const ability = await factory.createForUser(
      { id: 'owner', workspaceId: 'workspace', role: UserRole.OWNER } as never,
      'private-space',
    );

    expect(spaceMemberRepo.getUserSpaceRoles).not.toHaveBeenCalled();
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)).toBe(
      true,
    );
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Member)).toBe(
      true,
    );
  });

  it('does not let workspace owners bypass membership in personal spaces', async () => {
    const spaceMemberRepo = {
      getUserSpaceRoles: jest.fn().mockResolvedValue(undefined),
    };
    const spaceRepo = {
      findById: jest.fn().mockResolvedValue({ isPersonal: true }),
    };
    const factory = new SpaceAbilityFactory(
      spaceMemberRepo as never,
      spaceRepo as never,
    );

    await expect(
      factory.createForUser(
        {
          id: 'owner',
          workspaceId: 'workspace',
          role: UserRole.OWNER,
        } as never,
        'personal-space',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(spaceMemberRepo.getUserSpaceRoles).not.toHaveBeenCalled();
  });

  it('keeps ordinary workspace members scoped to their space role', async () => {
    const spaceMemberRepo = {
      getUserSpaceRoles: jest
        .fn()
        .mockResolvedValue([{ userId: 'member', role: SpaceRole.READER }]),
    };
    const factory = new SpaceAbilityFactory(
      spaceMemberRepo as never,
      { findById: jest.fn().mockResolvedValue({ isPersonal: false }) } as never,
    );

    const ability = await factory.createForUser(
      {
        id: 'member',
        workspaceId: 'workspace',
        role: UserRole.MEMBER,
      } as never,
      'space',
    );

    expect(ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)).toBe(true);
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Member)).toBe(
      false,
    );
  });
});
