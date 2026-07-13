import { SpaceRole, UserRole } from '../../../common/helpers/types/permission';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../interfaces/space-ability.type';
import SpaceAbilityFactory from './space-ability.factory';

describe('SpaceAbilityFactory', () => {
  it('gives workspace owners full space administration without membership', async () => {
    const spaceMemberRepo = {
      getUserSpaceRoles: jest.fn(),
    };
    const factory = new SpaceAbilityFactory(spaceMemberRepo as never);

    const ability = await factory.createForUser(
      { id: 'owner', role: UserRole.OWNER } as never,
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

  it('keeps ordinary workspace members scoped to their space role', async () => {
    const spaceMemberRepo = {
      getUserSpaceRoles: jest
        .fn()
        .mockResolvedValue([{ userId: 'member', role: SpaceRole.READER }]),
    };
    const factory = new SpaceAbilityFactory(spaceMemberRepo as never);

    const ability = await factory.createForUser(
      { id: 'member', role: UserRole.MEMBER } as never,
      'space',
    );

    expect(ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)).toBe(true);
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Member)).toBe(
      false,
    );
  });
});
