import { AuthProvider } from '@docmost/db/types/entity.types';

export const SSO_PROVIDER_TYPE = 'oidc';

export const SSO_PRESETS = [
  'generic',
  'keycloak',
  'google',
  'microsoft',
  'facebook',
] as const;
export type SsoPreset = (typeof SSO_PRESETS)[number];

export const SSO_PROMPTS = ['', 'login', 'select_account', 'consent'] as const;
export type SsoPrompt = (typeof SSO_PROMPTS)[number];

export const SSO_TOKEN_AUTH_METHODS = [
  'auto',
  'client_secret_post',
  'client_secret_basic',
] as const;
export type SsoTokenAuthMethod = (typeof SSO_TOKEN_AUTH_METHODS)[number];

export const FACEBOOK_GRAPH_VERSION = 'v26.0';
export const GOOGLE_ISSUER = 'https://accounts.google.com';
export const MICROSOFT_TENANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FACEBOOK_GRAPH_VERSION_PATTERN = /^v\d{1,3}\.\d{1,2}$/;
// RFC 6749 scope-token characters.
export const SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

// Stored in auth_providers.settings. Unset keys fall back to the preset
// defaults so providers created before a key existed keep working.
export type SsoProviderSettings = {
  preset?: SsoPreset;
  keycloakUrl?: string;
  keycloakRealm?: string;
  microsoftTenantId?: string;
  googleHostedDomain?: string;
  facebookGraphVersion?: string;
  scopes?: string;
  prompt?: SsoPrompt;
  tokenAuthMethod?: SsoTokenAuthMethod;
  groupClaimName?: string;
  groupFilter?: string[];
  ownerGroups?: string[];
  adminGroups?: string[];
  requireVerifiedEmail?: boolean;
};

export type EffectiveSsoSettings = Required<
  Pick<
    SsoProviderSettings,
    | 'preset'
    | 'scopes'
    | 'prompt'
    | 'tokenAuthMethod'
    | 'groupClaimName'
    | 'groupFilter'
    | 'ownerGroups'
    | 'adminGroups'
    | 'requireVerifiedEmail'
    | 'facebookGraphVersion'
  >
> &
  Pick<
    SsoProviderSettings,
    | 'keycloakUrl'
    | 'keycloakRealm'
    | 'microsoftTenantId'
    | 'googleHostedDomain'
  >;

type PresetDefinition = {
  protocol: 'oidc' | 'oauth2';
  defaultName: string;
  supportsGroups: boolean;
  defaults: Omit<
    EffectiveSsoSettings,
    | 'preset'
    | 'keycloakUrl'
    | 'keycloakRealm'
    | 'microsoftTenantId'
    | 'googleHostedDomain'
  >;
};

const OIDC_SCOPES = 'openid profile email';

const BASE_DEFAULTS: PresetDefinition['defaults'] = {
  scopes: OIDC_SCOPES,
  prompt: '',
  tokenAuthMethod: 'auto',
  groupClaimName: 'groups',
  groupFilter: [],
  // No group grants a workspace role unless an owner lists it. Providers
  // created before role mapping existed have ['Root'] stored instead (see
  // the 20261016T120000-sso-explicit-owner-groups migration).
  ownerGroups: [],
  adminGroups: [],
  requireVerifiedEmail: true,
  facebookGraphVersion: FACEBOOK_GRAPH_VERSION,
};

export const SSO_PRESET_DEFINITIONS: Record<SsoPreset, PresetDefinition> = {
  generic: {
    protocol: 'oidc',
    defaultName: 'OIDC',
    supportsGroups: true,
    // Forcing a fresh login was the only behaviour before prompt became
    // configurable, so existing generic providers keep it.
    defaults: { ...BASE_DEFAULTS, prompt: 'login' },
  },
  keycloak: {
    protocol: 'oidc',
    defaultName: 'Keycloak',
    supportsGroups: true,
    defaults: { ...BASE_DEFAULTS, prompt: 'login' },
  },
  google: {
    protocol: 'oidc',
    defaultName: 'Google',
    supportsGroups: false,
    defaults: { ...BASE_DEFAULTS, prompt: 'select_account' },
  },
  microsoft: {
    protocol: 'oidc',
    defaultName: 'Microsoft',
    supportsGroups: true,
    // Entra ID does not issue email_verified. Tenant-scoped issuers mean the
    // email attribute is managed by the tenant's administrators.
    defaults: {
      ...BASE_DEFAULTS,
      prompt: 'select_account',
      requireVerifiedEmail: false,
    },
  },
  facebook: {
    protocol: 'oauth2',
    defaultName: 'Facebook',
    supportsGroups: false,
    defaults: {
      ...BASE_DEFAULTS,
      scopes: 'email public_profile',
      requireVerifiedEmail: false,
    },
  },
};

export function isSsoPreset(value: unknown): value is SsoPreset {
  return (
    typeof value === 'string' && (SSO_PRESETS as readonly string[]).includes(value)
  );
}

export function getProviderPreset(provider: Pick<AuthProvider, 'settings'>) {
  const preset = (provider.settings as SsoProviderSettings | null)?.preset;
  return isSsoPreset(preset) ? preset : 'generic';
}

export function getPresetDefinition(preset: SsoPreset): PresetDefinition {
  return SSO_PRESET_DEFINITIONS[preset];
}

export function getEffectiveSettings(
  provider: Pick<AuthProvider, 'settings'>,
): EffectiveSsoSettings {
  const stored = (provider.settings ?? {}) as SsoProviderSettings;
  const preset = getProviderPreset(provider);
  const defaults = getPresetDefinition(preset).defaults;

  const pick = <K extends keyof PresetDefinition['defaults']>(key: K) =>
    (stored[key] ?? defaults[key]) as PresetDefinition['defaults'][K];

  return {
    preset,
    keycloakUrl: stored.keycloakUrl,
    keycloakRealm: stored.keycloakRealm,
    microsoftTenantId: stored.microsoftTenantId,
    googleHostedDomain: stored.googleHostedDomain,
    scopes: pick('scopes'),
    prompt: pick('prompt'),
    tokenAuthMethod: pick('tokenAuthMethod'),
    groupClaimName: pick('groupClaimName')?.trim() || defaults.groupClaimName,
    groupFilter: pick('groupFilter'),
    ownerGroups: pick('ownerGroups'),
    adminGroups: pick('adminGroups'),
    requireVerifiedEmail: pick('requireVerifiedEmail'),
    facebookGraphVersion: pick('facebookGraphVersion'),
  };
}

export function buildDefaultSettings(preset: SsoPreset): SsoProviderSettings {
  const defaults = getPresetDefinition(preset).defaults;
  return {
    preset,
    groupClaimName: defaults.groupClaimName,
    ownerGroups: defaults.ownerGroups,
    adminGroups: defaults.adminGroups,
    requireVerifiedEmail: defaults.requireVerifiedEmail,
  };
}

export function buildKeycloakIssuer(baseUrl: string, realm: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return `${base}/realms/${encodeURIComponent(realm.trim())}`;
}

export function buildMicrosoftIssuer(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId.trim().toLowerCase()}/v2.0`;
}

// Issuer derived from the preset's own fields. Generic providers store the
// issuer directly, and Facebook has no OIDC issuer.
export function resolveIssuer(
  preset: SsoPreset,
  settings: Pick<
    SsoProviderSettings,
    'keycloakUrl' | 'keycloakRealm' | 'microsoftTenantId'
  >,
  storedIssuer: string | null,
): string | null {
  switch (preset) {
    case 'keycloak':
      return settings.keycloakUrl?.trim() && settings.keycloakRealm?.trim()
        ? buildKeycloakIssuer(settings.keycloakUrl, settings.keycloakRealm)
        : null;
    case 'google':
      return GOOGLE_ISSUER;
    case 'microsoft':
      return settings.microsoftTenantId &&
        MICROSOFT_TENANT_ID_PATTERN.test(settings.microsoftTenantId.trim())
        ? buildMicrosoftIssuer(settings.microsoftTenantId)
        : null;
    case 'facebook':
      return null;
    default:
      return storedIssuer?.trim() || null;
  }
}

// Human-readable names of the settings still needed before a provider can
// be enabled.
export function getMissingConfig(provider: AuthProvider): string[] {
  const settings = getEffectiveSettings(provider);
  const missing: string[] = [];

  if (!provider.name?.trim()) missing.push('display name');

  switch (settings.preset) {
    case 'keycloak':
      if (!settings.keycloakUrl?.trim()) missing.push('Keycloak URL');
      if (!settings.keycloakRealm?.trim()) missing.push('realm');
      break;
    case 'microsoft':
      if (
        !settings.microsoftTenantId ||
        !MICROSOFT_TENANT_ID_PATTERN.test(settings.microsoftTenantId)
      ) {
        missing.push('directory (tenant) ID');
      }
      break;
    case 'generic':
      if (!provider.oidcIssuer?.trim()) missing.push('issuer URL');
      break;
  }

  if (!provider.oidcClientId?.trim()) missing.push('client ID');
  if (!provider.oidcClientSecret?.trim()) missing.push('client secret');

  return missing;
}

export function normalizeScopes(
  scopes: string,
  protocol: PresetDefinition['protocol'],
): string {
  const tokens = scopes
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && SCOPE_TOKEN_PATTERN.test(token));

  if (protocol === 'oidc' && !tokens.includes('openid')) {
    tokens.unshift('openid');
  }

  return [...new Set(tokens)].join(' ');
}
