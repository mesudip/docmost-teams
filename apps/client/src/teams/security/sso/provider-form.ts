import type { TFunction } from "i18next";
import {
  CreateSsoProviderPayload,
  ISsoProvider,
  SSO_PROVIDER_TYPE,
  SsoPreset,
  SsoProviderFieldsPayload,
  SsoPrompt,
  SsoTokenAuthMethod,
  TestSsoProviderPayload,
  UpdateSsoProviderPayload,
} from "./sso.types";
import {
  FACEBOOK_GRAPH_VERSION_PATTERN,
  KEYCLOAK_REALM_INVALID_CHARS,
  MICROSOFT_TENANT_ID_PATTERN,
  NEW_PROVIDER_FLAGS,
  SSO_PRESET_INFO,
  deriveKeycloakIssuer,
  presetSupportsGroups,
  toSsoPreset,
} from "./sso-presets";

// The login prompt as a form choice. "none" stands for the server's "",
// which sends no prompt parameter.
export type PromptChoice = "none" | Exclude<SsoPrompt, "">;

export interface ProviderFormValues {
  name: string;
  oidcIssuer: string;
  oidcClientId: string;
  // Always starts empty; blank keeps the stored secret.
  oidcClientSecret: string;
  isEnabled: boolean;
  allowSignup: boolean;
  groupSync: boolean;
  keycloakUrl: string;
  keycloakRealm: string;
  microsoftTenantId: string;
  googleHostedDomain: string;
  facebookGraphVersion: string;
  scopes: string;
  prompt: PromptChoice;
  tokenAuthMethod: SsoTokenAuthMethod;
  requireVerifiedEmail: boolean;
  groupClaimName: string;
  groupFilter: string[];
  ownerGroups: string[];
  adminGroups: string[];
}

export function toPromptChoice(
  prompt: SsoPrompt | null | undefined,
): PromptChoice {
  return prompt ? prompt : "none";
}

export function fromPromptChoice(choice: PromptChoice): SsoPrompt {
  return choice === "none" ? "" : choice;
}

export function getProviderPreset(
  provider: Pick<ISsoProvider, "settings">,
): SsoPreset {
  return toSsoPreset(provider.settings?.preset);
}

// Values of an unsaved draft: exactly what the server applies on create.
export function draftFormValues(preset: SsoPreset): ProviderFormValues {
  const info = SSO_PRESET_INFO[preset];
  const defaults = info.defaults;
  return {
    name: info.defaultName,
    oidcIssuer: "",
    oidcClientId: "",
    oidcClientSecret: "",
    isEnabled: NEW_PROVIDER_FLAGS.isEnabled,
    allowSignup: NEW_PROVIDER_FLAGS.allowSignup,
    groupSync: NEW_PROVIDER_FLAGS.groupSync,
    keycloakUrl: "",
    keycloakRealm: "",
    microsoftTenantId: "",
    googleHostedDomain: "",
    facebookGraphVersion: defaults.facebookGraphVersion,
    scopes: defaults.scopes,
    prompt: toPromptChoice(defaults.prompt),
    tokenAuthMethod: defaults.tokenAuthMethod,
    requireVerifiedEmail: defaults.requireVerifiedEmail,
    groupClaimName: defaults.groupClaimName,
    groupFilter: [...defaults.groupFilter],
    ownerGroups: [...defaults.ownerGroups],
    adminGroups: [...defaults.adminGroups],
  };
}

// Values of a saved provider. Settings it doesn't store show the preset
// default, which is what the server uses for them.
export function savedFormValues(provider: ISsoProvider): ProviderFormValues {
  const preset = getProviderPreset(provider);
  const defaults = SSO_PRESET_INFO[preset].defaults;
  const stored = provider.settings ?? {};
  return {
    name: provider.name ?? "",
    oidcIssuer: provider.oidcIssuer ?? "",
    oidcClientId: provider.oidcClientId ?? "",
    oidcClientSecret: "",
    isEnabled: provider.isEnabled === true,
    allowSignup: provider.allowSignup === true,
    groupSync: provider.groupSync === true,
    keycloakUrl: stored.keycloakUrl ?? "",
    keycloakRealm: stored.keycloakRealm ?? "",
    microsoftTenantId: stored.microsoftTenantId ?? "",
    googleHostedDomain: stored.googleHostedDomain ?? "",
    facebookGraphVersion:
      stored.facebookGraphVersion ?? defaults.facebookGraphVersion,
    scopes: stored.scopes ?? defaults.scopes,
    prompt: toPromptChoice(stored.prompt ?? defaults.prompt),
    tokenAuthMethod: stored.tokenAuthMethod ?? defaults.tokenAuthMethod,
    requireVerifiedEmail:
      stored.requireVerifiedEmail ?? defaults.requireVerifiedEmail,
    groupClaimName: stored.groupClaimName?.trim() || defaults.groupClaimName,
    groupFilter: [...(stored.groupFilter ?? defaults.groupFilter)],
    ownerGroups: [...(stored.ownerGroups ?? defaults.ownerGroups)],
    adminGroups: [...(stored.adminGroups ?? defaults.adminGroups)],
  };
}

const TOP_LEVEL_KEYS = new Set([
  "name",
  "oidcIssuer",
  "oidcClientId",
  "isEnabled",
  "allowSignup",
  "groupSync",
]);

type FieldValue = string | boolean | string[];
type Snapshot = Record<string, FieldValue>;

export function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function cleanScopes(scopes: string): string {
  return scopes.trim().split(/\s+/).filter(Boolean).join(" ");
}

// Normalized values of the fields that apply to the preset, keyed by the
// name the server expects. Normalization follows the server, so a value the
// server would store unchanged never counts as an edit.
function snapshot(preset: SsoPreset, values: ProviderFormValues): Snapshot {
  const fields: Snapshot = {
    name: values.name.trim(),
    oidcClientId: values.oidcClientId.trim(),
    isEnabled: values.isEnabled,
    allowSignup: values.allowSignup,
    scopes: cleanScopes(values.scopes),
    prompt: fromPromptChoice(values.prompt),
    requireVerifiedEmail: values.requireVerifiedEmail,
  };

  switch (preset) {
    case "generic":
      fields.oidcIssuer = values.oidcIssuer.trim();
      break;
    case "keycloak":
      fields.keycloakUrl = values.keycloakUrl.trim().replace(/\/+$/, "");
      fields.keycloakRealm = values.keycloakRealm.trim();
      break;
    case "microsoft":
      fields.microsoftTenantId = values.microsoftTenantId.trim().toLowerCase();
      break;
    case "google":
      fields.googleHostedDomain = values.googleHostedDomain
        .trim()
        .toLowerCase();
      break;
    case "facebook":
      fields.facebookGraphVersion = values.facebookGraphVersion.trim();
      break;
  }

  // Facebook always posts the client secret.
  if (preset !== "facebook") {
    fields.tokenAuthMethod = values.tokenAuthMethod;
  }

  if (presetSupportsGroups(preset)) {
    fields.groupSync = values.groupSync;
    fields.groupClaimName = values.groupClaimName.trim();
    fields.groupFilter = cleanList(values.groupFilter);
    fields.ownerGroups = cleanList(values.ownerGroups);
    fields.adminGroups = cleanList(values.adminGroups);
  }

  return fields;
}

function sameValue(a: FieldValue | undefined, b: FieldValue | undefined) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}

function changedKeys(before: Snapshot, after: Snapshot): string[] {
  return Object.keys(after).filter(
    (key) => !sameValue(before[key], after[key]),
  );
}

function toPayload(fields: Snapshot, keys: string[]): SsoProviderFieldsPayload {
  const payload: Record<string, unknown> = {};
  const settings: Record<string, unknown> = {};
  for (const key of keys) {
    if (TOP_LEVEL_KEYS.has(key)) {
      payload[key] = fields[key];
    } else {
      settings[key] = fields[key];
    }
  }
  if (Object.keys(settings).length > 0) {
    payload.settings = settings;
  }
  return payload as SsoProviderFieldsPayload;
}

function withSecret<T extends SsoProviderFieldsPayload>(
  payload: T,
  values: ProviderFormValues,
): T {
  const secret = values.oidcClientSecret.trim();
  return secret ? { ...payload, oidcClientSecret: secret } : payload;
}

// One /sso/create request: the client-generated id, the preset, the name and
// the fields that differ from the preset defaults.
export function buildCreatePayload(
  id: string,
  preset: SsoPreset,
  values: ProviderFormValues,
): CreateSsoProviderPayload {
  const before = snapshot(preset, draftFormValues(preset));
  const after = snapshot(preset, values);
  const changes = toPayload(after, changedKeys(before, after));
  return withSecret(
    {
      ...changes,
      id,
      type: SSO_PROVIDER_TYPE,
      preset,
      name: after.name as string,
    },
    values,
  );
}

// /sso/update with only the fields that differ from the stored values.
export function buildUpdatePayload(
  providerId: string,
  preset: SsoPreset,
  initialValues: ProviderFormValues,
  values: ProviderFormValues,
): UpdateSsoProviderPayload {
  const before = snapshot(preset, initialValues);
  const after = snapshot(preset, values);
  return withSecret(
    { providerId, ...toPayload(after, changedKeys(before, after)) },
    values,
  );
}

// /sso/test with every value the form shows. Saved providers are tested by
// id, drafts by preset; a blank secret falls back to the stored one.
export function buildTestPayload(
  target: { providerId: string } | { preset: SsoPreset },
  preset: SsoPreset,
  values: ProviderFormValues,
): TestSsoProviderPayload {
  const fields = snapshot(preset, values);
  return withSecret(
    { ...toPayload(fields, Object.keys(fields)), ...target },
    values,
  );
}

export function hasUnsavedChanges(
  preset: SsoPreset,
  initialValues: ProviderFormValues,
  values: ProviderFormValues,
): boolean {
  if (values.oidcClientSecret.trim()) return true;
  const before = snapshot(preset, initialValues);
  const after = snapshot(preset, values);
  return changedKeys(before, after).length > 0;
}

// Validation mirrors SsoProviderConfigDto and SsoProviderSettingsDto.
// Whether an enabled provider is complete is left to the server, which
// names the missing fields.

const SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const MAX_LIST_ITEMS = 100;

export function isHttpUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export function usesInsecureHttp(
  preset: SsoPreset,
  values: ProviderFormValues,
): boolean {
  const url =
    preset === "generic"
      ? values.oidcIssuer
      : preset === "keycloak"
        ? values.keycloakUrl
        : "";
  return url.trim().toLowerCase().startsWith("http:");
}

// The issuer the server derives from the form (SsoService.buildProviderPatch
// and resolveIssuer), or null while the fields don't define one.
function derivedIssuer(
  preset: SsoPreset,
  values: ProviderFormValues,
): string | null {
  switch (preset) {
    case "generic":
      return values.oidcIssuer.trim() || null;
    case "keycloak":
      return deriveKeycloakIssuer(values.keycloakUrl, values.keycloakRealm);
    case "microsoft": {
      const tenant = values.microsoftTenantId.trim().toLowerCase();
      return MICROSOFT_TENANT_ID_PATTERN.test(tenant)
        ? `https://login.microsoftonline.com/${tenant}/v2.0`
        : null;
    }
    default:
      return null;
  }
}

// The server sends a saved client secret only to the issuer it was saved
// for, so pointing a saved provider at a new issuer needs the secret again.
export function needsSecretReentry(
  preset: SsoPreset,
  initialValues: ProviderFormValues,
  values: ProviderFormValues,
  hasStoredSecret: boolean,
): boolean {
  const issuer = derivedIssuer(preset, values);
  return (
    hasStoredSecret &&
    !values.oidcClientSecret.trim() &&
    issuer !== null &&
    issuer !== derivedIssuer(preset, initialValues)
  );
}

export type ProviderFormErrors = Partial<
  Record<keyof ProviderFormValues, string>
>;

export function validateProviderForm(
  preset: SsoPreset,
  values: ProviderFormValues,
  t: TFunction,
  saved?: { initialValues: ProviderFormValues; hasStoredSecret: boolean },
): ProviderFormErrors {
  const errors: ProviderFormErrors = {};
  const tooLong = (max: number) =>
    t("Use at most {{count}} characters", { count: max });
  const checkLength = (key: keyof ProviderFormValues, max: number) => {
    const value = values[key];
    if (typeof value === "string" && value.trim().length > max) {
      errors[key] = tooLong(max);
    }
  };
  const checkList = (key: "groupFilter" | "ownerGroups" | "adminGroups") => {
    const items = cleanList(values[key]);
    if (items.length > MAX_LIST_ITEMS) {
      errors[key] = t("Add at most {{count}} entries", {
        count: MAX_LIST_ITEMS,
      });
    } else if (items.some((item) => item.length > 255)) {
      errors[key] = t("Each entry can have at most {{count}} characters", {
        count: 255,
      });
    }
  };

  if (!values.name.trim()) {
    errors.name = t("Enter a display name");
  } else {
    checkLength("name", 100);
  }
  checkLength("oidcClientId", 512);
  checkLength("oidcClientSecret", 2048);
  if (
    saved &&
    needsSecretReentry(
      preset,
      saved.initialValues,
      values,
      saved.hasStoredSecret,
    )
  ) {
    errors.oidcClientSecret = t(
      "Enter the client secret again. A saved secret is only sent to the issuer it was saved for.",
    );
  }

  const scopes = values.scopes.trim();
  if (scopes.length > 512) {
    errors.scopes = tooLong(512);
  } else if (
    scopes &&
    !scopes.split(/\s+/).every((token) => SCOPE_TOKEN_PATTERN.test(token))
  ) {
    errors.scopes = t("Scopes can't contain quotes or backslashes");
  }

  if (preset === "generic") {
    const issuer = values.oidcIssuer.trim();
    if (issuer && !isHttpUrl(issuer)) {
      errors.oidcIssuer = t("Enter a URL that starts with http:// or https://");
    } else {
      checkLength("oidcIssuer", 512);
    }
  }

  if (preset === "keycloak") {
    const serverUrl = values.keycloakUrl.trim();
    if (serverUrl && !isHttpUrl(serverUrl)) {
      errors.keycloakUrl = t(
        "Enter a URL that starts with http:// or https://",
      );
    } else {
      checkLength("keycloakUrl", 512);
    }
    if (KEYCLOAK_REALM_INVALID_CHARS.test(values.keycloakRealm)) {
      errors.keycloakRealm = t("The realm can't contain / ? # or \\");
    } else {
      checkLength("keycloakRealm", 255);
    }
  }

  if (preset === "microsoft") {
    const tenant = values.microsoftTenantId.trim();
    if (tenant && !MICROSOFT_TENANT_ID_PATTERN.test(tenant)) {
      errors.microsoftTenantId = t(
        "Enter the directory (tenant) ID, a GUID like 00000000-0000-0000-0000-000000000000",
      );
    }
  }

  if (preset === "google") {
    const domain = values.googleHostedDomain.trim();
    if (domain && !DOMAIN_PATTERN.test(domain)) {
      errors.googleHostedDomain = t("Enter a domain name such as example.com");
    }
  }

  if (preset === "facebook") {
    const version = values.facebookGraphVersion.trim();
    if (version && !FACEBOOK_GRAPH_VERSION_PATTERN.test(version)) {
      errors.facebookGraphVersion = t("Use the form vNN.N, for example v26.0");
    }
  }

  // Group fields are only shown, and only checked, while group sync is on.
  if (presetSupportsGroups(preset) && values.groupSync) {
    checkLength("groupClaimName", 128);
    checkList("groupFilter");
    checkList("ownerGroups");
    checkList("adminGroups");
  }

  return errors;
}
