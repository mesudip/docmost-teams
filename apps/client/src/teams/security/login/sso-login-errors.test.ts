import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { loadServerModule } from "@/teams/test-utils/server-modules";
import {
  SSO_LOGIN_ERROR_CODES,
  getSsoLoginErrorMessage,
} from "./sso-login-errors";

const t = ((key: string) => key) as unknown as TFunction;
const generic = getSsoLoginErrorMessage("sso_failed", t);

describe("getSsoLoginErrorMessage", () => {
  it("knows every code the server sends", async () => {
    const server = await loadServerModule<{
      SSO_LOGIN_ERROR_CODES: readonly string[];
    }>("teams/sso/sso-login-error.ts");
    expect([...SSO_LOGIN_ERROR_CODES]).toEqual([
      ...server.SSO_LOGIN_ERROR_CODES,
    ]);
  });

  it("has its own message for each code", () => {
    const messages = SSO_LOGIN_ERROR_CODES.map((code) =>
      getSsoLoginErrorMessage(code, t),
    );
    expect(new Set(messages).size).toBe(SSO_LOGIN_ERROR_CODES.length);
    for (const message of messages) {
      expect(message).toEqual(expect.any(String));
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("never shows text taken from the link", () => {
    const crafted = "Your account is locked, call +1 555 0100";
    const message = getSsoLoginErrorMessage(crafted, t);
    expect(message).toBe(generic);
    expect(message).not.toContain("555");
  });

  it.each([
    "toString",
    "constructor",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
    "isPrototypeOf",
    "__defineGetter__",
    "prototype",
    "",
    "SIGNUP_DISABLED",
  ])("falls back to the generic message for %j", (code) => {
    expect(getSsoLoginErrorMessage(code, t)).toBe(generic);
  });

  it("does not suggest requesting an invitation when sign-up is off", () => {
    const message = getSsoLoginErrorMessage("signup_disabled", t);
    expect(message.toLowerCase()).not.toContain("invit");
    expect(message.toLowerCase()).toContain("admin");
    expect(message).not.toBe(generic);
  });
});
