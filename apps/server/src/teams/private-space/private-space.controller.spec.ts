import { ForbiddenException } from '@nestjs/common';
import { PrivateSpaceController } from './private-space.controller';

describe('PrivateSpaceController', () => {
  it('creates a distinct private space through the core space service', async () => {
    const spaceService = {
      createSpace: jest.fn().mockResolvedValue({ id: 'space' }),
    };
    const controller = new PrivateSpaceController(
      spaceService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await controller.create(
      { name: 'Private' },
      { id: 'user' } as never,
      {
        id: 'workspace',
        settings: { spaces: { allowPersonal: true } },
      } as never,
    );

    expect(spaceService.createSpace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user' }),
      'workspace',
      expect.objectContaining({ name: 'Private' }),
      undefined,
      { isPersonal: true },
    );
  });

  it('rejects creation when private spaces are disabled', async () => {
    const controller = new PrivateSpaceController(
      {
        createSpace: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.create(
        { name: 'Private' },
        { id: 'user' } as never,
        { id: 'workspace', settings: {} } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only allows workspace admins to convert a space', async () => {
    const privateSpaceService = {
      convertSpace: jest.fn().mockResolvedValue({ id: 'space' }),
    };
    const controller = new PrivateSpaceController(
      {} as never,
      privateSpaceService as never,
      {} as never,
      { findById: jest.fn().mockResolvedValue({ isPersonal: false }) } as never,
    );

    await controller.convert(
      { spaceId: '019f4d06-672a-7a5e-8aeb-bf6dba0154a9', isPersonal: true },
      { role: 'admin' } as never,
      { id: 'workspace' } as never,
    );

    expect(privateSpaceService.convertSpace).toHaveBeenCalledWith(
      '019f4d06-672a-7a5e-8aeb-bf6dba0154a9',
      'workspace',
      true,
    );
  });

  it('rejects a member attempting to convert a space', async () => {
    const controller = new PrivateSpaceController(
      {} as never,
      {} as never,
      {} as never,
      { findById: jest.fn().mockResolvedValue({ isPersonal: false }) } as never,
    );

    await expect(
      controller.convert(
        { spaceId: '019f4d06-672a-7a5e-8aeb-bf6dba0154a9', isPersonal: true },
        { role: 'member' } as never,
        { id: 'workspace' } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
