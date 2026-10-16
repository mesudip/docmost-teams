import { describe, expect, it } from "vitest";
import { canSignIn, countSignInProviders, wouldLockOut } from "./lockout";

const keycloak = { id: "kc", type: "oidc", isEnabled: true };
const google = { id: "google", type: "oidc", isEnabled: true };
const disabledOidc = { id: "off", type: "oidc", isEnabled: false };
const leftoverSaml = { id: "saml", type: "saml", isEnabled: true };

describe("wouldLockOut", () => {
  it("never blocks while Enforce SSO is off", () => {
    expect(wouldLockOut(false, [keycloak], "kc")).toBe(false);
  });

  it("blocks removing the last enabled provider while SSO is enforced", () => {
    expect(wouldLockOut(true, [keycloak], "kc")).toBe(true);
    expect(wouldLockOut(true, [keycloak, disabledOidc], "kc")).toBe(true);
  });

  it("allows it when another enabled OIDC provider remains", () => {
    expect(wouldLockOut(true, [keycloak, google], "kc")).toBe(false);
  });

  it("does not count providers this server can't sign in with", () => {
    expect(wouldLockOut(true, [keycloak, leftoverSaml], "kc")).toBe(true);
  });

  it("allows removing providers nobody can sign in with", () => {
    expect(wouldLockOut(true, [keycloak, disabledOidc], "off")).toBe(false);
    expect(wouldLockOut(true, [keycloak, leftoverSaml], "saml")).toBe(false);
    expect(wouldLockOut(true, [keycloak], "unknown")).toBe(false);
  });
});

describe("countSignInProviders", () => {
  it("counts enabled OIDC providers only", () => {
    expect(
      countSignInProviders([keycloak, google, disabledOidc, leftoverSaml]),
    ).toBe(2);
    expect(countSignInProviders([])).toBe(0);
    expect(canSignIn(leftoverSaml)).toBe(false);
  });
});
