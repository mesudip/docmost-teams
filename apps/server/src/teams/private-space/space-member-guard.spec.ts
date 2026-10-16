import { Test } from '@nestjs/testing';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberService } from '../../core/space/services/space-member.service';

// The isPersonal guards docmost-teams adds to upstream's SpaceMemberService.
describe('private space membership', () => {
  it('never allows a private space to gain members', async () => {
    const spaceRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'private-space', isPersonal: true }),
    };
    // Built by Nest so new upstream constructor parameters don't break it.
    const moduleRef = await Test.createTestingModule({
      providers: [SpaceMemberService],
    })
      .useMocker((token) => (token === SpaceRepo ? spaceRepo : {}))
      .compile();
    const service = moduleRef.get(SpaceMemberService);

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
