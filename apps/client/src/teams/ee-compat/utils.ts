// Cloud-only helpers for workspace hostnames. Self-hosted installs never
// reach them; if they did, they keep the browser on this origin.

export function getHostnameUrl(_hostname: string): string {
  return window.location.origin;
}

export function exchangeTokenRedirectUrl(
  _hostname: string,
  _token: string,
): string {
  return window.location.origin;
}
