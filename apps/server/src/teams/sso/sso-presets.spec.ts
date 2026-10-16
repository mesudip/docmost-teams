import {
  buildDefaultSettings,
  getEffectiveSettings,
  getMissingConfig,
  normalizeScopes,
  resolveIssuer,
  SSO_PRESETS,
} from './sso-presets';

describe('sso presets', () => {
  it('derives issuers from preset fields', () => {
    expect(
      resolveIssuer(
        'keycloak',
        { keycloakUrl: 'https://sso.example.com/', keycloakRealm: 'acme' },
        null,
      ),
    ).toBe('https://sso.example.com/realms/acme');
    expect(
      resolveIssuer(
        'microsoft',
        { microsoftTenantId: '6F1C2E4A-1111-2222-3333-444455556666' },
        null,
      ),
    ).toBe(
      'https://login.microsoftonline.com/6f1c2e4a-1111-2222-3333-444455556666/v2.0',
    );
    expect(resolveIssuer('google', {}, null)).toBe(
      'https://accounts.google.com',
    );
    expect(resolveIssuer('facebook', {}, 'ignored')).toBeNull();
    expect(resolveIssuer('generic', {}, ' https://idp.example.com ')).toBe(
      'https://idp.example.com',
    );
  });

  it('rejects multi-tenant Microsoft authorities', () => {
    expect(
      resolveIssuer('microsoft', { microsoftTenantId: 'common' }, null),
    ).toBeNull();
    expect(
      resolveIssuer('microsoft', { microsoftTenantId: 'organizations' }, null),
    ).toBeNull();
  });

  it('keeps the original behaviour for providers saved before presets', () => {
    // The 20261016T120000 migration stores ownerGroups: ['Root'] for them.
    const settings = getEffectiveSettings({
      settings: {
        groupClaimName: 'roles',
        requireVerifiedEmail: true,
        ownerGroups: ['Root'],
      },
    });

    expect(settings.preset).toBe('generic');
    expect(settings.prompt).toBe('login');
    expect(settings.ownerGroups).toEqual(['Root']);
    expect(settings.groupClaimName).toBe('roles');
  });

  it('maps no groups to workspace roles by default', () => {
    for (const preset of SSO_PRESETS) {
      const settings = getEffectiveSettings({
        settings: buildDefaultSettings(preset),
      });
      expect(settings.ownerGroups).toEqual([]);
      expect(settings.adminGroups).toEqual([]);
    }
    expect(getEffectiveSettings({ settings: {} }).ownerGroups).toEqual([]);
  });

  it('uses preset defaults for unset settings', () => {
    const microsoft = getEffectiveSettings({
      settings: buildDefaultSettings('microsoft'),
    });
    expect(microsoft.requireVerifiedEmail).toBe(false);
    expect(microsoft.prompt).toBe('select_account');

    const facebook = getEffectiveSettings({
      settings: buildDefaultSettings('facebook'),
    });
    expect(facebook.scopes).toBe('email public_profile');
  });

  it('lists the settings each preset still needs', () => {
    const base = {
      name: 'SSO',
      oidcIssuer: null,
      oidcClientId: 'id',
      oidcClientSecret: 'secret',
    };

    expect(
      getMissingConfig({
        ...base,
        settings: { preset: 'keycloak', keycloakUrl: 'https://kc' },
      } as never),
    ).toEqual(['realm']);
    expect(
      getMissingConfig({
        ...base,
        oidcClientSecret: null,
        settings: { preset: 'google' },
      } as never),
    ).toEqual(['client secret']);
    expect(
      getMissingConfig({ ...base, settings: { preset: 'generic' } } as never),
    ).toEqual(['issuer URL']);
  });

  it('normalizes scopes and always requests openid for OIDC', () => {
    expect(normalizeScopes('profile  email groups profile', 'oidc')).toBe(
      'openid profile email groups',
    );
    expect(normalizeScopes('email public_profile', 'oauth2')).toBe(
      'email public_profile',
    );
    expect(normalizeScopes('email "bad"', 'oauth2')).toBe('email');
  });
});
