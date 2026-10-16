import { beforeAll, describe, expect, it } from "vitest";
import { loadServerModule } from "@/teams/test-utils/server-modules";
import {
  FACEBOOK_GRAPH_VERSION_PATTERN,
  MICROSOFT_TENANT_ID_PATTERN,
  NEW_PROVIDER_FLAGS,
  SSO_PRESET_INFO,
  deriveKeycloakIssuer,
} from "./sso-presets";
import {
  SSO_PRESETS,
  SSO_PROMPTS,
  SSO_PROVIDER_TYPE,
  SSO_TOKEN_AUTH_METHODS,
} from "./sso.types";
import { draftFormValues, fromPromptChoice } from "./provider-form";

type ServerPresets = {
  SSO_PROVIDER_TYPE: string;
  SSO_PRESETS: readonly string[];
  SSO_PROMPTS: readonly string[];
  SSO_TOKEN_AUTH_METHODS: readonly string[];
  SSO_PRESET_DEFINITIONS: Record<string, unknown>;
  MICROSOFT_TENANT_ID_PATTERN: RegExp;
  FACEBOOK_GRAPH_VERSION_PATTERN: RegExp;
  buildKeycloakIssuer: (baseUrl: string, realm: string) => string;
};

let server: ServerPresets;

beforeAll(async () => {
  server = await loadServerModule<ServerPresets>("teams/sso/sso-presets.ts");
});

describe("client SSO presets", () => {
  it("match the server's preset definitions exactly", () => {
    expect(SSO_PRESET_INFO).toEqual(server.SSO_PRESET_DEFINITIONS);
  });

  it("list the same presets, prompts and token auth methods", () => {
    expect([...SSO_PRESETS]).toEqual([...server.SSO_PRESETS]);
    expect([...SSO_PROMPTS]).toEqual([...server.SSO_PROMPTS]);
    expect([...SSO_TOKEN_AUTH_METHODS]).toEqual([
      ...server.SSO_TOKEN_AUTH_METHODS,
    ]);
    expect(SSO_PROVIDER_TYPE).toBe(server.SSO_PROVIDER_TYPE);
  });

  it("validate tenant IDs and Graph API versions like the server", () => {
    expect(MICROSOFT_TENANT_ID_PATTERN.source).toBe(
      server.MICROSOFT_TENANT_ID_PATTERN.source,
    );
    expect(MICROSOFT_TENANT_ID_PATTERN.flags).toBe(
      server.MICROSOFT_TENANT_ID_PATTERN.flags,
    );
    expect(FACEBOOK_GRAPH_VERSION_PATTERN.source).toBe(
      server.FACEBOOK_GRAPH_VERSION_PATTERN.source,
    );
  });

  it.each([
    ["https://kc.example.com", "docmost"],
    ["https://kc.example.com///", " team a "],
    [" http://localhost:8081/ ", "realm#1"],
  ])("derive the same Keycloak issuer as the server for %j", (url, realm) => {
    expect(deriveKeycloakIssuer(url, realm)).toBe(
      server.buildKeycloakIssuer(url, realm),
    );
  });

  it("derive no Keycloak issuer until both parts are set", () => {
    expect(deriveKeycloakIssuer("", "docmost")).toBeNull();
    expect(deriveKeycloakIssuer("https://kc.example.com", "  ")).toBeNull();
  });
});

describe("draft defaults", () => {
  // SsoService.buildNewProvider creates providers disabled, without
  // sign-up and without group sync.
  it("start disabled, without sign-up or group sync", () => {
    expect(NEW_PROVIDER_FLAGS).toEqual({
      isEnabled: false,
      allowSignup: false,
      groupSync: false,
    });
  });

  it.each(SSO_PRESETS)("show what the server applies for %s", (preset) => {
    const values = draftFormValues(preset);
    const info = SSO_PRESET_INFO[preset];

    expect(values.name).toBe(info.defaultName);
    expect(values.isEnabled).toBe(false);
    expect(values.allowSignup).toBe(false);
    expect(values.groupSync).toBe(false);
    expect(values.oidcClientSecret).toBe("");
    expect(values.scopes).toBe(info.defaults.scopes);
    expect(fromPromptChoice(values.prompt)).toBe(info.defaults.prompt);
    expect(values.tokenAuthMethod).toBe(info.defaults.tokenAuthMethod);
    expect(values.requireVerifiedEmail).toBe(
      info.defaults.requireVerifiedEmail,
    );
    expect(values.groupClaimName).toBe(info.defaults.groupClaimName);
    expect(values.groupFilter).toEqual(info.defaults.groupFilter);
    expect(values.ownerGroups).toEqual(info.defaults.ownerGroups);
    expect(values.adminGroups).toEqual(info.defaults.adminGroups);
    expect(values.facebookGraphVersion).toBe(
      info.defaults.facebookGraphVersion,
    );
  });

  it("does not share list instances with the preset table", () => {
    const values = draftFormValues("generic");
    values.ownerGroups.push("Admins");
    expect(SSO_PRESET_INFO.generic.defaults.ownerGroups).toEqual([]);
  });
});
