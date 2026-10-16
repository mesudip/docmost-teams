// With Enforce SSO on and a single provider, the login page sends people
// straight to that provider. These rules keep that from looping.

export const AUTO_REDIRECT_STORAGE_KEY = "docmost-teams:sso-auto-redirect-at";
export const AUTO_REDIRECT_COOLDOWN_MS = 5 * 60 * 1000;

export interface AutoRedirectState {
  enforceSso: boolean;
  providerCount: number;
  signedIn: boolean;
  pathname: string;
  search: string;
  // When this tab last redirected automatically (ms), if known.
  lastRedirectAt: number | null;
  now: number;
}

export function isInvitationPath(pathname: string): boolean {
  return pathname === "/invites" || pathname.startsWith("/invites/");
}

export function shouldAutoRedirect(state: AutoRedirectState): boolean {
  if (!state.enforceSso || state.providerCount !== 1 || state.signedIn) {
    return false;
  }

  const params = new URLSearchParams(state.search);
  if (params.has("logout") || params.has("sso_error")) return false;

  if (isInvitationPath(state.pathname)) return false;

  if (state.lastRedirectAt !== null) {
    const elapsed = state.now - state.lastRedirectAt;
    // A timestamp slightly in the future (clock change) also counts.
    if (Math.abs(elapsed) < AUTO_REDIRECT_COOLDOWN_MS) return false;
  }

  return true;
}

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Access itself can throw when storage is blocked.
    return null;
  }
}

// Unreadable or missing storage counts as "no earlier redirect".
export function readLastAutoRedirect(
  storage: Storage | null = sessionStore(),
): number | null {
  try {
    const raw = storage?.getItem(AUTO_REDIRECT_STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberAutoRedirect(
  now: number,
  storage: Storage | null = sessionStore(),
): void {
  try {
    storage?.setItem(AUTO_REDIRECT_STORAGE_KEY, String(now));
  } catch {
    // Storage full or blocked: the redirect still happens.
  }
}
