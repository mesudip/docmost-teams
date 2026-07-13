import { SpaceMemberService } from './space-member.service';

describe('SpaceMemberService', () => {
  it('never allows a private space to gain members', async () => {
    const spaceRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'private-space', isPersonal: true }),
    };
    const service = new SpaceMemberService(
      {} as any,
      {} as any,
      spaceRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.addMembersToSpaceBatch(
        {
          spaceId: 'private-space',
          userIds: ['another-user'],
          role: 'reader',
        } as any,
        { id: 'owner' } as any,
        'workspace',
      ),
    ).rejects.toThrow('Private spaces cannot be shared');
  });
});
