import { ISsoProvider, SSO_PROVIDER_TYPE } from "./sso.types";

type ProviderState = Pick<ISsoProvider, "id" | "type" | "isEnabled">;

// Only enabled OIDC providers can sign anyone in on this server. Enabled
// SAML, LDAP or Google rows left over from an upstream install don't count.
export function canSignIn(provider: ProviderState): boolean {
  return provider.isEnabled === true && provider.type === SSO_PROVIDER_TYPE;
}

export function countSignInProviders(providers: ProviderState[]): number {
  return providers.filter(canSignIn).length;
}

// With Enforce SSO on, deleting or disabling the last provider people can
// sign in with would lock everyone out. The server refuses it too; the UI
// checks first so it can explain what to do.
export function wouldLockOut(
  enforceSso: boolean,
  providers: ProviderState[],
  providerId: string,
): boolean {
  if (!enforceSso) return false;
  const target = providers.find((provider) => provider.id === providerId);
  if (!target || !canSignIn(target)) return false;
  return !providers.some(
    (provider) => provider.id !== providerId && canSignIn(provider),
  );
}
