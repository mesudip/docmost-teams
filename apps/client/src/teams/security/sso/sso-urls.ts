import { getAppUrl } from "@/lib/config";

function providerBase(providerId: string): string {
  return `${getAppUrl()}/api/sso/oidc/${encodeURIComponent(providerId)}`;
}

// Redirect URI to register at the identity provider.
export function buildSsoCallbackUrl(providerId: string): string {
  return `${providerBase(providerId)}/callback`;
}

// Starts a login with the provider. `redirectPath` must already be a safe
// same-origin path (core getRedirectParam()); the server checks it again.
export function buildSsoLoginUrl(
  providerId: string,
  redirectPath?: string | null,
): string {
  const url = `${providerBase(providerId)}/login`;
  if (!redirectPath) return url;
  return `${url}?${new URLSearchParams({ redirect: redirectPath }).toString()}`;
}
