// Codes are passed to the login page as `?sso_error=<code>` and mapped to
// fixed messages there, so a crafted link cannot inject arbitrary text.
export const SSO_LOGIN_ERROR_CODES = [
  'state_invalid',
  'provider_unavailable',
  'idp_error',
  'email_missing',
  'email_unverified',
  'domain_not_allowed',
  'signup_disabled',
  'account_inactive',
  'sso_failed',
] as const;

export type SsoLoginErrorCode = (typeof SSO_LOGIN_ERROR_CODES)[number];

export class SsoLoginError extends Error {
  constructor(
    readonly code: SsoLoginErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SsoLoginError';
  }
}
