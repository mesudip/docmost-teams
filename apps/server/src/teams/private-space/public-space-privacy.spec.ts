import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PublicSpaceRepo } from '@docmost/db/repos/public-space/public-space.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { LicenseCheckService } from '../../integrations/environment/license-check.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { PublicSpaceService } from '../../core/public-space/public-space.service';

// Private spaces never become public, whatever their public_spaces row says
// (the isPersonal checks in upstream's PublicSpaceService).

const WORKSPACE_ID = '018f0000-0000-7000-8000-000000000001';
const SPACE_ID = '018f0000-0000-7000-8000-000000000002';
const OTHER_SPACE_ID = '018f0000-0000-7000-8000-000000000004';
const workspace = {
  id: WORKSPACE_ID,
  settings: { publicSpaces: { enabled: true } },
} as any;

const space = (overrides: Record<string, unknown> = {}) => ({
  id: SPACE_ID,
  slug: 'handbook',
  name: 'Handbook',
  workspaceId: WORKSPACE_ID,
  deletedAt: null,
  isPersonal: false,
  ...overrides,
});

async function makeService(
  overrides: { spaceRepo?: object; pageRepo?: object } = {},
) {
  const publicSpaceRepo = {
    findBySpaceId: jest.fn().mockResolvedValue({
      id: 'ps1',
      spaceId: SPACE_ID,
      enabled: true,
      searchIndexing: false,
    }),
    upsert: jest.fn().mockImplementation(async (opts) => opts),
  };
  const mocks = new Map<unknown, object>([
    [PublicSpaceRepo, publicSpaceRepo],
    [
      SpaceRepo,
      { findBySlug: jest.fn().mockResolvedValue(space()), ...overrides.spaceRepo },
    ],
    [PageRepo, { ...overrides.pageRepo }],
    [
      PagePermissionRepo,
      { hasRestrictedAncestor: jest.fn().mockResolvedValue(false) },
    ],
    [LicenseCheckService, { resolveFeatures: jest.fn().mockReturnValue([]) }],
    [
      EnvironmentService,
      { isBetaPublicSpaces: jest.fn().mockReturnValue(true) },
    ],
  ]);

  // Built by Nest so new upstream constructor parameters don't break it.
  const moduleRef = await Test.createTestingModule({
    providers: [PublicSpaceService],
  })
    .useMocker((token) => mocks.get(token) ?? {})
    .compile();

  return { service: moduleRef.get(PublicSpaceService), publicSpaceRepo };
}

describe('public spaces and private spaces', () => {
  it('404s for a private space even with an enabled public_spaces row', async () => {
    const { service } = await makeService({
      spaceRepo: {
        findBySlug: jest.fn().mockResolvedValue(space({ isPersonal: true })),
      },
    });

    await expect(service.getPublicSpace('handbook', workspace)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses to publish a private space but lets it be unpublished', async () => {
    const { service, publicSpaceRepo } = await makeService();
    const privateSpace = space({ isPersonal: true }) as any;

    await expect(
      service.publish({
        space: privateSpace,
        workspace,
        authUserId: 'u1',
        enabled: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(publicSpaceRepo.upsert).not.toHaveBeenCalled();

    await service.publish({
      space: privateSpace,
      workspace,
      authUserId: 'u1',
      enabled: false,
    });
    expect(publicSpaceRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('404s a cross-space link into a private space', async () => {
    const { service } = await makeService({
      pageRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'page2',
          slugId: 'crossSlug001',
          spaceId: OTHER_SPACE_ID,
          workspaceId: WORKSPACE_ID,
          deletedAt: null,
          content: null,
        }),
      },
      spaceRepo: {
        findById: jest.fn().mockResolvedValue(
          space({ id: OTHER_SPACE_ID, slug: 'engineering', isPersonal: true }),
        ),
      },
    });

    await expect(
      service.getPublicPage('handbook', 'crossSlug001', workspace, {
        includeContent: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still resolves a cross-space link into an ordinary published space', async () => {
    const { service } = await makeService({
      pageRepo: {
        findById: jest.fn().mockResolvedValue({
          id: 'page2',
          slugId: 'crossSlug001',
          spaceId: OTHER_SPACE_ID,
          workspaceId: WORKSPACE_ID,
          deletedAt: null,
          content: null,
        }),
      },
      spaceRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(space({ id: OTHER_SPACE_ID, slug: 'engineering' })),
      },
    });

    const result = await service.getPublicPage(
      'handbook',
      'crossSlug001',
      workspace,
      { includeContent: false },
    );
    expect(result.space.slug).toBe('engineering');
  });
});
