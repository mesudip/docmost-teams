import { ForbiddenException } from '@nestjs/common';
import { PrivateSpaceController } from './private-space.controller';

describe('PrivateSpaceController', () => {
  it('creates a distinct private space through the core space service', async () => {
    const spaceService = {
      createSpace: jest.fn().mockResolvedValue({ id: 'space' }),
    };
    const controller = new PrivateSpaceController(spaceService as never);

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
    const controller = new PrivateSpaceController({
      createSpace: jest.fn(),
    } as never);

    await expect(
      controller.create(
        { name: 'Private' },
        { id: 'user' } as never,
        { id: 'workspace', settings: {} } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
