import { ForbiddenException, Logger } from '@nestjs/common';
import { UserRole } from '../../common/helpers/types/permission';
import { SsoController } from './sso.controller';

// The service pulls in openid-client, an ES module Jest doesn't transform.
jest.mock('./sso.service', () => ({ SsoService: class {} }));

describe('SsoController', () => {
  const providerId = '0191c3c0-0000-7000-8000-000000000001';
  const workspace = { id: 'ws' } as never;
  const userWithRole = (role: UserRole) => ({ id: 'u1', role }) as never;
  const ssoService = {
    listProviders: jest.fn().mockResolvedValue({ items: [] }),
    getProvider: jest.fn().mockResolvedValue({}),
    createProvider: jest.fn().mockResolvedValue({}),
    updateProvider: jest.fn().mockResolvedValue({}),
    testProvider: jest.fn().mockResolvedValue({}),
    deleteProvider: jest.fn().mockResolvedValue(undefined),
    buildOrigin: jest.fn(),
  };
  const environment = {
    getAppUrl: () => 'http://localhost:3000',
    isHttps: () => false,
  };
  const controller = new SsoController(
    ssoService as never,
    {} as never,
    environment as never,
  );

  afterEach(() => jest.clearAllMocks());

  it('lets admins view providers', async () => {
    const admin = userWithRole(UserRole.ADMIN);

    await controller.providers(admin, workspace);
    await controller.info(admin, workspace, { providerId });

    expect(ssoService.listProviders).toHaveBeenCalledWith('ws');
    expect(ssoService.getProvider).toHaveBeenCalledWith('ws', providerId);
  });

  it('lets only owners change or test providers', async () => {
    const admin = userWithRole(UserRole.ADMIN);

    await expect(
      controller.create(admin, workspace, { type: 'oidc' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.update(admin, workspace, { providerId }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.test(admin, workspace, { providerId }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.remove(admin, workspace, { providerId }),
    ).rejects.toThrow(ForbiddenException);
    expect(ssoService.createProvider).not.toHaveBeenCalled();
    expect(ssoService.updateProvider).not.toHaveBeenCalled();
    expect(ssoService.testProvider).not.toHaveBeenCalled();
    expect(ssoService.deleteProvider).not.toHaveBeenCalled();

    const owner = userWithRole(UserRole.OWNER);
    await controller.create(owner, workspace, { type: 'oidc' });
    await controller.update(owner, workspace, { providerId });
    await controller.test(owner, workspace, { providerId });
    await controller.remove(owner, workspace, { providerId });
    expect(ssoService.createProvider).toHaveBeenCalledTimes(1);
    expect(ssoService.updateProvider).toHaveBeenCalledTimes(1);
    expect(ssoService.testProvider).toHaveBeenCalledTimes(1);
    expect(ssoService.deleteProvider).toHaveBeenCalledTimes(1);
  });

  it('keeps members out', async () => {
    await expect(
      controller.providers(userWithRole(UserRole.MEMBER), workspace),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sends sign-in errors to the login page instead of rendering them', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const res = {
      code: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
      setCookie: jest.fn(),
    };

    await controller.oidcLogin(
      { raw: {}, params: { providerId }, headers: {} } as never,
      res as never,
    );

    expect(ssoService.buildOrigin).not.toHaveBeenCalled();
    expect(res.code).toHaveBeenCalledWith(302);
    expect(res.redirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?sso_error=sso_failed',
    );
  });
});
