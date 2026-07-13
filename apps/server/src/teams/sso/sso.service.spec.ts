import { BadRequestException } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SsoService } from './sso.service';

jest.mock('openid-client', () => ({
  allowInsecureRequests: Symbol('allowInsecureRequests'),
  authorizationCodeGrant: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  ClientSecretPost: jest.fn(),
  discovery: jest.fn(),
  fetchUserInfo: jest.fn(),
  randomNonce: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  randomState: jest.fn(),
}));

describe('SsoService security helpers', () => {
  let service: SsoService;
  const environment = {
    getAppSecret: () => 'test-secret-with-at-least-thirty-two-characters',
    getAppUrl: () => 'http://localhost:3000',
  } as EnvironmentService;

  beforeEach(() => {
    process.env.OIDC_ALLOWED_REDIRECT_ORIGINS =
      'http://localhost:3000,http://localhost:5173';
    service = new SsoService(
      {} as never,
      {} as never,
      {} as never,
      environment,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterEach(() => {
    delete process.env.OIDC_ALLOWED_REDIRECT_ORIGINS;
  });

  const validState = () => ({
    codeVerifier: 'verifier',
    expiresAt: Date.now() + 60_000,
    nonce: 'nonce',
    origin: 'http://localhost:5173',
    providerId: 'provider',
    redirectPath: '/home',
    state: 'state',
  });

  it('round-trips a signed state cookie and rejects tampering', () => {
    const state = validState();
    const encoded = service.encodeStateCookie(state);
    expect(service.decodeStateCookie(encoded)).toEqual(state);

    const [payload, signature] = encoded.split('.');
    const tamperedPayload = `${payload.slice(0, -1)}A`;
    expect(
      service.decodeStateCookie(`${tamperedPayload}.${signature}`),
    ).toBeNull();
  });

  it('rejects expired state cookies', () => {
    const encoded = service.encodeStateCookie({
      ...validState(),
      expiresAt: Date.now() - 1,
    });
    expect(service.decodeStateCookie(encoded)).toBeNull();
  });

  it('allows configured redirect origins and rejects untrusted hosts', () => {
    expect(service.buildOrigin('localhost:5173', 'http')).toBe(
      'http://localhost:5173',
    );
    expect(() => service.buildOrigin('attacker.example', 'https')).toThrow(
      BadRequestException,
    );
  });

  it('redacts provider secrets from API responses', () => {
    const helpers = service as unknown as {
      sanitizeProvider(
        provider: Record<string, unknown>,
      ): Record<string, unknown>;
    };
    const result = helpers.sanitizeProvider({
      id: 'provider',
      oidcClientSecret: 'super-secret',
    });

    expect(result).not.toHaveProperty('oidcClientSecret');
    expect(result).toHaveProperty('hasOidcClientSecret', true);
  });

  it('requires verified email by default but permits an explicit opt-out', () => {
    const helpers = service as unknown as {
      requiresVerifiedEmail(provider: Record<string, unknown>): boolean;
    };

    expect(helpers.requiresVerifiedEmail({ settings: {} })).toBe(true);
    expect(
      helpers.requiresVerifiedEmail({
        settings: { requireVerifiedEmail: false },
      }),
    ).toBe(false);
  });

  it('matches only the exact Root group name, case-insensitively', () => {
    const helpers = service as unknown as {
      hasRootAdminGroup(groups: string[]): boolean;
    };

    expect(helpers.hasRootAdminGroup(['ROOT'])).toBe(true);
    expect(helpers.hasRootAdminGroup(['Root Admin'])).toBe(false);
  });
});
