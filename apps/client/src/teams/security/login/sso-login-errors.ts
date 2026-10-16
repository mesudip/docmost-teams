import type { TFunction } from "i18next";

// Codes the server appends as `/login?sso_error=<code>`
// (apps/server/src/teams/sso/sso-login-error.ts).
export const SSO_LOGIN_ERROR_CODES = [
  "state_invalid",
  "provider_unavailable",
  "idp_error",
  "email_missing",
  "email_unverified",
  "domain_not_allowed",
  "signup_disabled",
  "account_inactive",
  "sso_failed",
] as const;

export type SsoLoginErrorCode = (typeof SSO_LOGIN_ERROR_CODES)[number];

// Messages are fixed per code, so a crafted link can't put its own text on
// the login page. A Map only answers for its own keys: "toString",
// "__proto__" and other inherited names fall back to the generic message.
function buildMessages(t: TFunction): Map<SsoLoginErrorCode, string> {
  return new Map<SsoLoginErrorCode, string>([
    [
      "state_invalid",
      t(
        "The sign-in attempt expired or was started in another tab. Please try again.",
      ),
    ],
    [
      "provider_unavailable",
      t(
        "This sign-in option is not available right now. Try again later or contact a workspace admin.",
      ),
    ],
    [
      "idp_error",
      t(
        "Your identity provider returned an error, so you were not signed in. Please try again.",
      ),
    ],
    [
      "email_missing",
      t("Your identity provider did not share an email address for you."),
    ],
    [
      "email_unverified",
      t(
        "Your identity provider has not confirmed your email address. Confirm it there, then try again.",
      ),
    ],
    [
      "domain_not_allowed",
      t("This workspace does not accept sign-ins from your email address."),
    ],
    [
      "signup_disabled",
      t(
        "There is no account with your email address in this workspace. Contact a workspace admin to get access.",
      ),
    ],
    [
      "account_inactive",
      t(
        "Your account in this workspace is deactivated. Contact a workspace admin.",
      ),
    ],
    [
      "sso_failed",
      t(
        "Single sign-on failed. Please try again, or contact a workspace admin if it keeps happening.",
      ),
    ],
  ]);
}

export function getSsoLoginErrorMessage(code: string, t: TFunction): string {
  const messages = buildMessages(t);
  return messages.get(code as SsoLoginErrorCode) ?? messages.get("sso_failed");
}
