import { BadRequestException } from '@nestjs/common';
import {
  authorizationCodeGrant,
  discovery,
  fetchUserInfo,
} from 'openid-client';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SsoService } from './sso.service';
import { SsoLoginError } from './sso-login-error';

jest.mock('openid-client', () => ({
  allowInsecureRequests: jest.fn(),
  authorizationCodeGrant: jest.fn(),
  AuthorizationResponseError: class AuthorizationResponseError extends Error {},
  buildAuthorizationUrl: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  ClientSecretBasic: jest.fn(),
  ClientSecretPost: jest.fn(),
  genericGrantRequest: jest.fn(),
  Configuration: jest.fn(),
  discovery: jest.fn(),
  fetchUserInfo: jest.fn(),
  randomNonce: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  randomState: jest.fn(),
  ResponseBodyError: class ResponseBodyError extends Error {},
}));

type Row = Record<string, unknown>;

// Just enough of Kysely for provider changes: equality filters, row locks
// that do nothing, and transactions that run on the same rows.
function fakeProviderDb(state: { workspace: Row; providers: Row[] }) {
  const query = (table: string, kind: 'select' | 'update' | 'delete') => {
    const filters: Array<(row: Row) => boolean> = [];
    let changes: Row = {};
    let limit = Infinity;
    const rows = () =>
      (table === 'workspaces' ? [state.workspace] : state.providers)
        .filter((row) => filters.every((matches) => matches(row)))
        .slice(0, limit);

    const builder = {
      select: () => builder,
      selectAll: () => builder,
      forUpdate: () => builder,
      returningAll: () => builder,
      limit: (count: number) => {
        limit = count;
        return builder;
      },
      set: (values: Row) => {
        changes = values;
        return builder;
      },
      where: (column: string, op: string, value: unknown) => {
        filters.push((row) => {
          const actual = row[column] ?? null;
          if (op === '=' || op === 'is') return actual === value;
          if (op === '!=') return actual !== value;
          throw new Error(`Unsupported operator ${op}`);
        });
        return builder;
      },
      execute: async () => {
        const matched = rows();
        if (kind === 'delete') {
          state.providers = state.providers.filter(
            (row) => !matched.includes(row),
          );
        }
        return matched;
      },
      executeTakeFirst: async () => rows()[0],
      executeTakeFirstOrThrow: async () => {
        const [row] = rows();
        if (!row) throw new Error('No result');
        if (kind === 'update') Object.assign(row, changes);
        return row;
      },
    };
    return builder;
  };

  const db = {
    selectFrom: (table: string) => query(table, 'select'),
    updateTable: (table: string) => query(table, 'update'),
    deleteFrom: (table: string) => query(table, 'delete'),
    transaction: () => ({
      execute: (callback: (trx: unknown) => unknown) => callback(db),
    }),
  };
  return db;
}

type ServiceInternals = {
  sanitizeProvider(provider: Record<string, unknown>): Record<string, unknown>;
  buildProviderPatch(
    provider: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): Record<string, unknown>;
  resolveTokenAuthMethod(
    supported: string[] | undefined,
    configured: string,
  ): string;
  fetchOidcProfile(
    config: unknown,
    provider: Record<string, unknown>,
    settings: Record<string, unknown>,
    opts: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
};

describe('SsoService', () => {
  let service: SsoService;
  let internals: ServiceInternals;
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
      {} as never,      {} as never,
    );
    internals = service as unknown as ServiceInternals;
  });

  afterEach(() => {
    delete process.env.OIDC_ALLOWED_REDIRECT_ORIGINS;
    jest.resetAllMocks();
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

  describe('security helpers', () => {
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
      const result = internals.sanitizeProvider({
        id: 'provider',
        oidcClientSecret: 'super-secret',
      });

      expect(result).not.toHaveProperty('oidcClientSecret');
      expect(result).toHaveProperty('hasOidcClientSecret', true);
    });
  });

  describe('provider updates', () => {
    const provider = (settings: Record<string, unknown>) => ({
      id: 'provider',
      type: 'oidc',
      oidcIssuer: null,
      settings,
    });

    it('derives the Keycloak issuer from URL and realm', () => {
      const patch = internals.buildProviderPatch(
        provider({ preset: 'keycloak' }),
        {
          settings: {
            keycloakUrl: 'https://sso.example.com/',
            keycloakRealm: 'acme',
          },
        },
      );

      expect(patch.oidcIssuer).toBe('https://sso.example.com/realms/acme');
      expect(patch.settings).toMatchObject({
        preset: 'keycloak',
        keycloakUrl: 'https://sso.example.com',
      });
    });

    it('ignores an issuer sent for presets that derive their own', () => {
      const patch = internals.buildProviderPatch(provider({ preset: 'google' }), {
        oidcIssuer: 'https://evil.example.com',
      });
      expect(patch.oidcIssuer).toBe('https://accounts.google.com');
    });

    it('keeps the stored secret when a blank one is submitted', () => {
      const patch = internals.buildProviderPatch(provider({}), {
        oidcClientSecret: '   ',
      });
      expect(patch).not.toHaveProperty('oidcClientSecret');
    });

    it('does not enable group sync for presets without group claims', () => {
      const patch = internals.buildProviderPatch(
        provider({ preset: 'facebook' }),
        { groupSync: true },
      );
      expect(patch.groupSync).toBe(false);
    });

    it('does not let an update change the preset', () => {
      const patch = internals.buildProviderPatch(
        provider({ preset: 'keycloak' }),
        { settings: { preset: 'generic', scopes: 'openid groups' } },
      );
      expect(patch.settings).toMatchObject({
        preset: 'keycloak',
        scopes: 'openid groups',
      });
    });

    it('picks the token endpoint auth method from provider metadata', () => {
      expect(
        internals.resolveTokenAuthMethod(
          ['client_secret_basic', 'client_secret_post'],
          'auto',
        ),
      ).toBe('client_secret_post');
      expect(
        internals.resolveTokenAuthMethod(['client_secret_basic'], 'auto'),
      ).toBe('client_secret_basic');
      expect(internals.resolveTokenAuthMethod(undefined, 'auto')).toBe(
        'client_secret_basic',
      );
      expect(
        internals.resolveTokenAuthMethod(
          ['client_secret_post'],
          'client_secret_basic',
        ),
      ).toBe('client_secret_basic');
    });
  });

  describe('creating providers', () => {
    let inserted: Record<string, unknown>[];

    beforeEach(() => {
      inserted = [];
      const db = {
        insertInto: () => ({
          values: (values: Record<string, unknown>) => {
            inserted.push(values);
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => values,
              }),
            };
          },
        }),
      };
      service = new SsoService(
        db as never,
        {} as never,
        {} as never,
        environment,
        {} as never,        {} as never,
      );
    });

    it('stores the whole configuration in a single insert', async () => {
      const result = await service.createProvider('ws', 'user', {
        type: 'oidc',
        preset: 'keycloak',
        id: '0191c3c0-0000-7000-8000-000000000001',
        oidcClientId: 'docmost',
        oidcClientSecret: 'secret',
        isEnabled: true,
        settings: { keycloakUrl: 'https://kc.example.com', keycloakRealm: 'acme' },
      });

      expect(inserted).toHaveLength(1);
      expect(inserted[0]).toMatchObject({
        id: '0191c3c0-0000-7000-8000-000000000001',
        name: 'Keycloak',
        oidcIssuer: 'https://kc.example.com/realms/acme',
        oidcClientSecret: 'secret',
        isEnabled: true,
      });
      expect(result).not.toHaveProperty('oidcClientSecret');
    });

    it('inserts nothing when an enabled provider is incomplete', async () => {
      await expect(
        service.createProvider('ws', 'user', {
          type: 'oidc',
          preset: 'google',
          isEnabled: true,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(inserted).toHaveLength(0);
    });

    it('tests an unsaved provider without reading the database', async () => {
      const result = await service.testProvider('ws', {
        preset: 'microsoft',
        oidcClientId: 'client',
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain('directory (tenant) ID');
      expect(inserted).toHaveLength(0);
    });
  });

  describe('changing saved providers', () => {
    const stored = (overrides: Row = {}): Row => ({
      id: 'p1',
      workspaceId: 'ws',
      type: 'oidc',
      name: 'OIDC',
      isEnabled: true,
      deletedAt: null,
      oidcIssuer: 'https://idp.example.com',
      oidcClientId: 'client',
      oidcClientSecret: 'stored-secret',
      settings: { preset: 'generic' },
      ...overrides,
    });
    const serviceFor = (state: { workspace: Row; providers: Row[] }) =>
      new SsoService(
        fakeProviderDb(state) as never,
        {} as never,
        {} as never,
        environment,
        {} as never,
        {} as never,
      );

    it('does not send the stored secret to a different issuer when testing', async () => {
      const service = serviceFor({
        workspace: { id: 'ws', enforceSso: false },
        providers: [stored()],
      });

      const result = await service.testProvider('ws', {
        providerId: 'p1',
        oidcIssuer: 'https://attacker.example.com',
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Re-enter the client secret');
      expect(discovery).not.toHaveBeenCalled();
    });

    it('requires the secret again when an update changes the issuer', async () => {
      const state = {
        workspace: { id: 'ws', enforceSso: false },
        providers: [stored()],
      };
      const service = serviceFor(state);

      await expect(
        service.updateProvider('ws', {
          providerId: 'p1',
          oidcIssuer: 'https://other.example.com',
        }),
      ).rejects.toThrow('Re-enter the client secret');
      expect(state.providers[0].oidcIssuer).toBe('https://idp.example.com');

      await expect(
        service.updateProvider('ws', {
          providerId: 'p1',
          oidcIssuer: 'https://other.example.com',
          oidcClientSecret: 'new-secret',
        }),
      ).resolves.toMatchObject({ oidcIssuer: 'https://other.example.com' });
    });

    it('applies the same rule to issuers derived from preset fields', async () => {
      const service = serviceFor({
        workspace: { id: 'ws', enforceSso: false },
        providers: [
          stored({
            oidcIssuer: 'https://kc.example.com/realms/acme',
            settings: {
              preset: 'keycloak',
              keycloakUrl: 'https://kc.example.com',
              keycloakRealm: 'acme',
            },
          }),
        ],
      });

      await expect(
        service.updateProvider('ws', {
          providerId: 'p1',
          settings: { keycloakUrl: 'https://kc.attacker.example' },
        }),
      ).rejects.toThrow('Re-enter the client secret');
      await expect(
        service.updateProvider('ws', { providerId: 'p1', name: 'Keycloak' }),
      ).resolves.toMatchObject({ name: 'Keycloak' });
    });

    it('keeps the last enabled provider while SSO is enforced', async () => {
      const state = {
        workspace: { id: 'ws', enforceSso: true },
        providers: [stored()],
      };
      const service = serviceFor(state);

      await expect(
        service.updateProvider('ws', { providerId: 'p1', isEnabled: false }),
      ).rejects.toThrow('Enforce SSO');
      await expect(service.deleteProvider('ws', 'p1')).rejects.toThrow(
        'Enforce SSO',
      );
      expect(state.providers).toHaveLength(1);
      expect(state.providers[0].isEnabled).toBe(true);
    });

    it('lets another enabled provider take over before one is removed', async () => {
      const state = {
        workspace: { id: 'ws', enforceSso: true },
        providers: [stored(), stored({ id: 'p2' })],
      };
      const service = serviceFor(state);

      await expect(
        service.updateProvider('ws', { providerId: 'p1', isEnabled: false }),
      ).resolves.toMatchObject({ isEnabled: false });
      await service.deleteProvider('ws', 'p1');
      expect(state.providers.map((provider) => provider.id)).toEqual(['p2']);

      await expect(service.deleteProvider('ws', 'p2')).rejects.toThrow(
        'Enforce SSO',
      );
    });
  });

  describe('linking existing accounts', () => {
    // A query builder that finds nothing and accepts any write.
    const chain = () => {
      const builder: unknown = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === 'then') return undefined;
            if (prop === 'executeTakeFirst') return async () => undefined;
            if (prop === 'execute') return async () => [];
            return () => builder;
          },
        },
      );
      return builder;
    };
    const setup = (existing: Record<string, unknown>) => {
      const userRepo = {
        findByEmail: jest.fn().mockResolvedValue(existing),
        updateUser: jest.fn(),
        findById: jest.fn().mockResolvedValue(existing),
      };
      const userSessionRepo = { revokeByUserId: jest.fn() };
      const service = new SsoService(
        { selectFrom: chain, insertInto: chain } as never,
        {} as never,
        userRepo as never,
        environment,
        {} as never,
        userSessionRepo as never,
      );
      const link = () =>
        (
          service as unknown as {
            findOrCreateUser(opts: unknown): Promise<unknown>;
          }
        ).findOrCreateUser({
          workspace: { id: 'ws' },
          provider: { id: 'p1', allowSignup: false },
          providerUserId: 'subject',
          email: 'newhire@corp.test',
          name: 'New Hire',
        });
      return { userRepo, userSessionRepo, link };
    };

    it('takes over an account whose email Docmost never saw proven', async () => {
      const { userRepo, userSessionRepo, link } = setup({
        id: 'u1',
        emailVerifiedAt: null,
      });

      await link();

      expect(userRepo.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          emailVerifiedAt: expect.any(Date),
          password: expect.any(String),
          hasGeneratedPassword: true,
        }),
        'u1',
        'ws',
      );
      expect(userSessionRepo.revokeByUserId).toHaveBeenCalledWith('u1', 'ws');
    });

    it('links accounts with a proven email without touching them', async () => {
      const { userRepo, userSessionRepo, link } = setup({
        id: 'u1',
        emailVerifiedAt: new Date(),
      });

      await link();

      expect(userRepo.updateUser).not.toHaveBeenCalled();
      expect(userSessionRepo.revokeByUserId).not.toHaveBeenCalled();
    });
  });

  it('rejects a missing provider id with a bad request', async () => {
    await expect(
      service.getProvider('ws', undefined as never),
    ).rejects.toThrow(BadRequestException);
  });

  describe('OIDC profile', () => {
    const config = {
      serverMetadata: () => ({ userinfo_endpoint: 'https://idp/userinfo' }),
    };
    const opts = {
      cookieState: validState(),
      currentUrl: new URL('http://localhost:5173/api/sso/oidc/p/callback'),
    };
    const settings = (overrides: Record<string, unknown> = {}) => ({
      preset: 'generic',
      groupClaimName: 'groups',
      requireVerifiedEmail: true,
      ...overrides,
    });
    const mockTokens = (claims: Record<string, unknown>) =>
      (authorizationCodeGrant as jest.Mock).mockResolvedValue({
        access_token: 'access',
        claims: () => claims,
      });

    it('reads groups from UserInfo when the ID token has none', async () => {
      mockTokens({
        sub: 'u1',
        email: 'u1@example.com',
        email_verified: true,
        name: 'User One',
      });
      (fetchUserInfo as jest.Mock).mockResolvedValue({
        sub: 'u1',
        groups: ['/Eng'],
      });

      const profile = await internals.fetchOidcProfile(
        config,
        { id: 'p', groupSync: true },
        settings(),
        opts,
      );

      expect(profile).toMatchObject({
        subject: 'u1',
        email: 'u1@example.com',
        emailVerified: true,
        groups: ['/Eng'],
        groupsUnavailable: false,
      });
    });

    it('flags Entra group overage instead of reporting no groups', async () => {
      mockTokens({
        sub: 'u1',
        email: 'u1@example.com',
        name: 'User',
        _claim_names: { groups: 'src1' },
      });
      (fetchUserInfo as jest.Mock).mockResolvedValue({ sub: 'u1' });

      const profile = await internals.fetchOidcProfile(
        config,
        { id: 'p', groupSync: true },
        settings({ preset: 'microsoft', requireVerifiedEmail: false }),
        opts,
      );

      expect(profile.groups).toBeNull();
      expect(profile.groupsUnavailable).toBe(true);
    });

    it('falls back to the Microsoft UPN when no email claim is sent', async () => {
      mockTokens({
        sub: 'u1',
        name: 'User',
        preferred_username: 'User@Contoso.com',
        xms_edov: true,
      });
      (fetchUserInfo as jest.Mock).mockResolvedValue({ sub: 'u1' });

      const profile = await internals.fetchOidcProfile(
        config,
        { id: 'p', groupSync: false },
        settings({ preset: 'microsoft', requireVerifiedEmail: false }),
        opts,
      );

      expect(profile.email).toBe('user@contoso.com');
      expect(profile.emailVerified).toBe(true);
    });

    it('enforces the Google Workspace domain', async () => {
      mockTokens({
        sub: 'u1',
        email: 'u1@gmail.com',
        email_verified: true,
        name: 'User',
      });

      await expect(
        internals.fetchOidcProfile(
          config,
          { id: 'p', groupSync: false },
          settings({ preset: 'google', googleHostedDomain: 'acme.com' }),
          opts,
        ),
      ).rejects.toMatchObject({
        constructor: SsoLoginError,
        code: 'domain_not_allowed',
      });
    });

    it('reports token exchange failures as provider errors', async () => {
      (authorizationCodeGrant as jest.Mock).mockRejectedValue(
        new Error('invalid_grant'),
      );

      await expect(
        internals.fetchOidcProfile(
          config,
          { id: 'p', groupSync: false },
          settings(),
          opts,
        ),
      ).rejects.toMatchObject({ code: 'idp_error' });
    });
  });
});
