import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import {
  ProviderFormValues,
  buildCreatePayload,
  buildTestPayload,
  buildUpdatePayload,
  draftFormValues,
  hasUnsavedChanges,
  needsSecretReentry,
  savedFormValues,
  validateProviderForm,
} from "./provider-form";
import { ISsoProvider } from "./sso.types";

const t = ((key: string) => key) as unknown as TFunction;
const DRAFT_ID = "0198c0de-0000-7000-8000-000000000001";

function storedProvider(overrides: Partial<ISsoProvider> = {}): ISsoProvider {
  return {
    id: "0198c0de-0000-7000-8000-0000000000aa",
    name: "Company SSO",
    type: "oidc",
    oidcIssuer: "https://idp.example.com",
    oidcClientId: "docmost",
    allowSignup: false,
    isEnabled: true,
    groupSync: true,
    hasOidcClientSecret: true,
    settings: {
      preset: "generic",
      groupClaimName: "groups",
      ownerGroups: ["Root"],
      adminGroups: [],
      requireVerifiedEmail: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function edit(
  values: ProviderFormValues,
  changes: Partial<ProviderFormValues>,
): ProviderFormValues {
  return { ...values, ...changes };
}

describe("buildCreatePayload", () => {
  it("sends the id, type, preset and name for an untouched draft", () => {
    expect(
      buildCreatePayload(DRAFT_ID, "keycloak", draftFormValues("keycloak")),
    ).toEqual({
      id: DRAFT_ID,
      type: "oidc",
      preset: "keycloak",
      name: "Keycloak",
    });
  });

  it("adds only the fields the admin changed", () => {
    const values = edit(draftFormValues("keycloak"), {
      name: "  Staff login ",
      keycloakUrl: "https://kc.example.com/",
      keycloakRealm: "staff",
      oidcClientId: " docmost ",
      oidcClientSecret: " s3cret ",
      isEnabled: true,
      prompt: "none",
      ownerGroups: ["Root", "Platform"],
    });

    expect(buildCreatePayload(DRAFT_ID, "keycloak", values)).toEqual({
      id: DRAFT_ID,
      type: "oidc",
      preset: "keycloak",
      name: "Staff login",
      oidcClientId: "docmost",
      oidcClientSecret: "s3cret",
      isEnabled: true,
      settings: {
        keycloakUrl: "https://kc.example.com",
        keycloakRealm: "staff",
        prompt: "",
        ownerGroups: ["Root", "Platform"],
      },
    });
  });

  it("omits a blank secret", () => {
    const payload = buildCreatePayload(
      DRAFT_ID,
      "generic",
      edit(draftFormValues("generic"), { oidcClientSecret: "   " }),
    );
    expect(payload).not.toHaveProperty("oidcClientSecret");
  });

  it("leaves out fields the preset doesn't use", () => {
    const values = edit(draftFormValues("facebook"), {
      groupSync: true,
      tokenAuthMethod: "client_secret_basic",
      oidcIssuer: "https://ignored.example.com",
      keycloakRealm: "ignored",
      facebookGraphVersion: "v25.0",
    });
    expect(buildCreatePayload(DRAFT_ID, "facebook", values)).toEqual({
      id: DRAFT_ID,
      type: "oidc",
      preset: "facebook",
      name: "Facebook",
      settings: { facebookGraphVersion: "v25.0" },
    });
  });
});

describe("buildUpdatePayload", () => {
  it("sends only the provider id when nothing changed", () => {
    const provider = storedProvider();
    const initial = savedFormValues(provider);
    expect(
      buildUpdatePayload(provider.id, "generic", initial, { ...initial }),
    ).toEqual({ providerId: provider.id });
  });

  it("sends only the changed fields", () => {
    const provider = storedProvider();
    const initial = savedFormValues(provider);
    const values = edit(initial, {
      name: "Company login",
      scopes: "openid  profile email groups",
      adminGroups: ["Editors", " ", "Editors"],
    });

    expect(buildUpdatePayload(provider.id, "generic", initial, values)).toEqual(
      {
        providerId: provider.id,
        name: "Company login",
        settings: {
          scopes: "openid profile email groups",
          adminGroups: ["Editors"],
        },
      },
    );
  });

  it("keeps the stored secret when the field is blank", () => {
    const provider = storedProvider();
    const initial = savedFormValues(provider);
    const payload = buildUpdatePayload(
      provider.id,
      "generic",
      initial,
      edit(initial, { oidcClientSecret: "", allowSignup: true }),
    );
    expect(payload).toEqual({ providerId: provider.id, allowSignup: true });
  });

  it("sends a new secret when one is typed", () => {
    const provider = storedProvider();
    const initial = savedFormValues(provider);
    expect(
      buildUpdatePayload(
        provider.id,
        "generic",
        initial,
        edit(initial, { oidcClientSecret: " rotated " }),
      ),
    ).toEqual({ providerId: provider.id, oidcClientSecret: "rotated" });
  });

  it("treats values the server would normalize the same as unchanged", () => {
    const provider = storedProvider({
      settings: {
        preset: "microsoft",
        microsoftTenantId: "0f2c1a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
      },
    });
    const initial = savedFormValues(provider);
    const values = edit(initial, {
      microsoftTenantId: " 0F2C1A3B-4D5E-4F60-8A7B-9C0D1E2F3A4B ",
    });
    expect(
      buildUpdatePayload(provider.id, "microsoft", initial, values),
    ).toEqual({ providerId: provider.id });
    expect(hasUnsavedChanges("microsoft", initial, values)).toBe(false);
  });
});

describe("buildTestPayload", () => {
  it("tests a draft by preset", () => {
    const payload = buildTestPayload(
      { preset: "google" },
      "google",
      edit(draftFormValues("google"), {
        oidcClientId: "client",
        oidcClientSecret: "secret",
      }),
    );
    expect(payload).toMatchObject({
      preset: "google",
      name: "Google",
      oidcClientId: "client",
      oidcClientSecret: "secret",
      settings: {
        googleHostedDomain: "",
        prompt: "select_account",
        scopes: "openid profile email",
      },
    });
    expect(payload).not.toHaveProperty("providerId");
  });

  it("tests a saved provider by id with every shown value", () => {
    const provider = storedProvider();
    const payload = buildTestPayload(
      { providerId: provider.id },
      "generic",
      savedFormValues(provider),
    );
    expect(payload).toMatchObject({
      providerId: provider.id,
      oidcIssuer: "https://idp.example.com",
      oidcClientId: "docmost",
      settings: { prompt: "login", tokenAuthMethod: "auto" },
    });
    expect(payload).not.toHaveProperty("preset");
    expect(payload).not.toHaveProperty("oidcClientSecret");
  });
});

describe("savedFormValues", () => {
  it("fills settings the provider doesn't store with preset defaults", () => {
    const values = savedFormValues(
      storedProvider({ settings: { preset: "microsoft" }, groupSync: false }),
    );
    expect(values.prompt).toBe("select_account");
    expect(values.requireVerifiedEmail).toBe(false);
    expect(values.scopes).toBe("openid profile email");
    expect(values.ownerGroups).toEqual([]);
    expect(values.oidcClientSecret).toBe("");
  });

  it("prefers stored values and treats a missing preset as generic", () => {
    const values = savedFormValues(
      storedProvider({
        settings: { prompt: "", groupFilter: ["team-*"] },
      }),
    );
    expect(values.prompt).toBe("none");
    expect(values.groupFilter).toEqual(["team-*"]);
    expect(values.groupClaimName).toBe("groups");
  });
});

describe("hasUnsavedChanges", () => {
  it("notices edits and typed secrets", () => {
    const initial = draftFormValues("generic");
    expect(hasUnsavedChanges("generic", initial, { ...initial })).toBe(false);
    expect(
      hasUnsavedChanges("generic", initial, edit(initial, { name: "Okta" })),
    ).toBe(true);
    expect(
      hasUnsavedChanges(
        "generic",
        initial,
        edit(initial, { oidcClientSecret: "x" }),
      ),
    ).toBe(true);
  });
});

describe("validateProviderForm", () => {
  it("requires a display name of at most 100 characters", () => {
    const values = draftFormValues("generic");
    expect(
      validateProviderForm("generic", edit(values, { name: " " }), t).name,
    ).toBeTruthy();
    expect(
      validateProviderForm(
        "generic",
        edit(values, { name: "x".repeat(101) }),
        t,
      ).name,
    ).toBeTruthy();
    expect(validateProviderForm("generic", values, t)).toEqual({});
  });

  it("accepts only http and https issuer URLs", () => {
    const values = draftFormValues("generic");
    const check = (oidcIssuer: string) =>
      validateProviderForm("generic", edit(values, { oidcIssuer }), t)
        .oidcIssuer;
    expect(check("")).toBeUndefined();
    expect(check("https://idp.example.com/realms/a")).toBeUndefined();
    expect(check("http://localhost:8081")).toBeUndefined();
    expect(check("ftp://idp.example.com")).toBeTruthy();
    expect(check("idp.example.com")).toBeTruthy();
    expect(check("javascript:alert(1)")).toBeTruthy();
  });

  it("rejects Keycloak realms with / ? # or \\", () => {
    const values = draftFormValues("keycloak");
    for (const realm of ["a/b", "a?b", "a#b", "a\\b"]) {
      expect(
        validateProviderForm(
          "keycloak",
          edit(values, { keycloakRealm: realm }),
          t,
        ).keycloakRealm,
      ).toBeTruthy();
    }
    expect(
      validateProviderForm(
        "keycloak",
        edit(values, { keycloakRealm: "team" }),
        t,
      ).keycloakRealm,
    ).toBeUndefined();
  });

  it("checks preset-specific formats", () => {
    expect(
      validateProviderForm(
        "microsoft",
        edit(draftFormValues("microsoft"), { microsoftTenantId: "contoso" }),
        t,
      ).microsoftTenantId,
    ).toBeTruthy();
    expect(
      validateProviderForm(
        "facebook",
        edit(draftFormValues("facebook"), { facebookGraphVersion: "26" }),
        t,
      ).facebookGraphVersion,
    ).toBeTruthy();
    expect(
      validateProviderForm(
        "google",
        edit(draftFormValues("google"), { googleHostedDomain: "not a domain" }),
        t,
      ).googleHostedDomain,
    ).toBeTruthy();
    expect(
      validateProviderForm(
        "google",
        edit(draftFormValues("google"), { googleHostedDomain: "example.com" }),
        t,
      ),
    ).toEqual({});
  });
});

describe("secret re-entry", () => {
  const saved = savedFormValues(storedProvider());
  const keycloak = savedFormValues(
    storedProvider({
      oidcIssuer: "https://kc.example.com/realms/acme",
      settings: {
        preset: "keycloak",
        keycloakUrl: "https://kc.example.com",
        keycloakRealm: "acme",
      },
    }),
  );

  it("asks for the secret again when a saved provider's issuer changes", () => {
    const moved = { ...saved, oidcIssuer: "https://other.example.com" };
    expect(needsSecretReentry("generic", saved, moved, true)).toBe(true);
    expect(
      validateProviderForm("generic", moved, t, {
        initialValues: saved,
        hasStoredSecret: true,
      }).oidcClientSecret,
    ).toBeTruthy();

    const withSecret = { ...moved, oidcClientSecret: "new-secret" };
    expect(needsSecretReentry("generic", saved, withSecret, true)).toBe(false);
  });

  it("follows issuers derived from preset fields", () => {
    expect(
      needsSecretReentry(
        "keycloak",
        keycloak,
        { ...keycloak, keycloakRealm: "other" },
        true,
      ),
    ).toBe(true);
    expect(
      needsSecretReentry(
        "keycloak",
        keycloak,
        { ...keycloak, keycloakUrl: "https://kc.example.com/" },
        true,
      ),
    ).toBe(false);
  });

  it("leaves other edits, cleared issuers and unsaved secrets alone", () => {
    expect(
      needsSecretReentry("generic", saved, { ...saved, name: "Renamed" }, true),
    ).toBe(false);
    expect(
      needsSecretReentry("generic", saved, { ...saved, oidcIssuer: "" }, true),
    ).toBe(false);
    expect(
      needsSecretReentry(
        "generic",
        saved,
        { ...saved, oidcIssuer: "https://other.example.com" },
        false,
      ),
    ).toBe(false);
  });
});
