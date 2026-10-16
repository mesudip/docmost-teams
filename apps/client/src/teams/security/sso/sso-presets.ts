import type { TFunction } from "i18next";
import {
  SSO_PRESETS,
  SsoPreset,
  SsoPrompt,
  SsoTokenAuthMethod,
} from "./sso.types";

// Client copy of the server's preset defaults
// (SSO_PRESET_DEFINITIONS in apps/server/src/teams/sso/sso-presets.ts).
// A draft starts from these values, so what the admin sees is what the
// server stores. sso-presets.test.ts compares this table with the server's.

export interface SsoPresetDefaults {
  scopes: string;
  prompt: SsoPrompt;
  tokenAuthMethod: SsoTokenAuthMethod;
  groupClaimName: string;
  groupFilter: string[];
  ownerGroups: string[];
  adminGroups: string[];
  requireVerifiedEmail: boolean;
  facebookGraphVersion: string;
}

export interface SsoPresetInfo {
  protocol: "oidc" | "oauth2";
  defaultName: string;
  supportsGroups: boolean;
  defaults: SsoPresetDefaults;
}

const FACEBOOK_GRAPH_VERSION = "v26.0";

const shared: SsoPresetDefaults = {
  scopes: "openid profile email",
  prompt: "",
  tokenAuthMethod: "auto",
  groupClaimName: "groups",
  groupFilter: [],
  ownerGroups: [],
  adminGroups: [],
  requireVerifiedEmail: true,
  facebookGraphVersion: FACEBOOK_GRAPH_VERSION,
};

export const SSO_PRESET_INFO: Record<SsoPreset, SsoPresetInfo> = {
  generic: {
    protocol: "oidc",
    defaultName: "OIDC",
    supportsGroups: true,
    defaults: { ...shared, prompt: "login" },
  },
  keycloak: {
    protocol: "oidc",
    defaultName: "Keycloak",
    supportsGroups: true,
    defaults: { ...shared, prompt: "login" },
  },
  google: {
    protocol: "oidc",
    defaultName: "Google",
    supportsGroups: false,
    defaults: { ...shared, prompt: "select_account" },
  },
  microsoft: {
    protocol: "oidc",
    defaultName: "Microsoft",
    supportsGroups: true,
    defaults: {
      ...shared,
      prompt: "select_account",
      requireVerifiedEmail: false,
    },
  },
  facebook: {
    protocol: "oauth2",
    defaultName: "Facebook",
    supportsGroups: false,
    defaults: {
      ...shared,
      scopes: "email public_profile",
      requireVerifiedEmail: false,
    },
  },
};

// Provider columns a new provider starts with (SsoService.buildNewProvider).
export const NEW_PROVIDER_FLAGS = {
  isEnabled: false,
  allowSignup: false,
  groupSync: false,
} as const;

// Same rules as the server DTO.
export const MICROSOFT_TENANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FACEBOOK_GRAPH_VERSION_PATTERN = /^v\d{1,3}\.\d{1,2}$/;
export const KEYCLOAK_REALM_INVALID_CHARS = /[/\\?#]/;

export function isSsoPreset(value: unknown): value is SsoPreset {
  return (
    typeof value === "string" &&
    (SSO_PRESETS as readonly string[]).includes(value)
  );
}

export function toSsoPreset(value: unknown): SsoPreset {
  return isSsoPreset(value) ? value : "generic";
}

export function presetSupportsGroups(preset: SsoPreset): boolean {
  return SSO_PRESET_INFO[preset].supportsGroups;
}

// Issuer the server derives for Keycloak (shown read-only in the form).
export function deriveKeycloakIssuer(
  serverUrl: string,
  realm: string,
): string | null {
  const base = serverUrl.trim().replace(/\/+$/, "");
  const trimmedRealm = realm.trim();
  if (!base || !trimmedRealm) return null;
  return `${base}/realms/${encodeURIComponent(trimmedRealm)}`;
}

export function getPresetLabel(preset: SsoPreset, t: TFunction): string {
  switch (preset) {
    case "keycloak":
      return t("Keycloak");
    case "google":
      return t("Google");
    case "microsoft":
      return t("Microsoft Entra ID");
    case "facebook":
      return t("Facebook");
    default:
      return t("Generic OIDC");
  }
}
