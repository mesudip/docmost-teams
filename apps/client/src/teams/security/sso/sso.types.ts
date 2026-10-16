// Shapes of the docmost-teams SSO API (apps/server/src/teams/sso).

export const SSO_PROVIDER_TYPE = "oidc";

export const SSO_PRESETS = [
  "generic",
  "keycloak",
  "google",
  "microsoft",
  "facebook",
] as const;
export type SsoPreset = (typeof SSO_PRESETS)[number];

// Server values for the login prompt; "" sends no prompt parameter.
export const SSO_PROMPTS = ["", "login", "select_account", "consent"] as const;
export type SsoPrompt = (typeof SSO_PROMPTS)[number];

export const SSO_TOKEN_AUTH_METHODS = [
  "auto",
  "client_secret_post",
  "client_secret_basic",
] as const;
export type SsoTokenAuthMethod = (typeof SSO_TOKEN_AUTH_METHODS)[number];

// Stored in auth_providers.settings. Unset keys fall back to the preset
// defaults on the server.
export interface SsoProviderSettings {
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
}

// A provider as returned by /sso/providers and /sso/info. The client secret
// itself is never returned.
export interface ISsoProvider {
  id: string;
  name: string;
  type: string;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  allowSignup: boolean;
  isEnabled: boolean;
  groupSync: boolean;
  settings: SsoProviderSettings | null;
  hasOidcClientSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

// A provider as listed in the public workspace data on the login page.
export interface IAuthProvider {
  id: string;
  name: string;
  type: string;
  preset?: string | null;
}

// Settings keys the admin form can send. The server derives `preset`.
export type SsoSettingsPayload = Omit<SsoProviderSettings, "preset">;

export interface SsoProviderFieldsPayload {
  name?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  allowSignup?: boolean;
  isEnabled?: boolean;
  groupSync?: boolean;
  settings?: SsoSettingsPayload;
}

export interface CreateSsoProviderPayload extends SsoProviderFieldsPayload {
  id: string;
  type: typeof SSO_PROVIDER_TYPE;
  preset: SsoPreset;
  name: string;
}

export interface UpdateSsoProviderPayload extends SsoProviderFieldsPayload {
  providerId: string;
}

// A saved provider is tested by id, an unsaved draft by preset.
export type TestSsoProviderPayload = SsoProviderFieldsPayload &
  ({ providerId: string } | { preset: SsoPreset });

export type SsoCredentialsCheck = "valid" | "invalid" | "unknown";

export interface SsoTestResult {
  ok: boolean;
  message: string;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string | null;
  tokenAuthMethod?: string;
  credentials: SsoCredentialsCheck;
  warnings: string[];
}
