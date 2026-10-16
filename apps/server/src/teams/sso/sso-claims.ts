type ClaimSource = Record<string, unknown> | null | undefined;

const MAX_GROUP_NAME_LENGTH = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a claim by name or dot-separated path. Keys that themselves contain
 * dots (for example `resource_access.my.client.roles`) are matched by trying
 * the longest key first at every level.
 */
export function readClaim(source: ClaimSource, path: string): unknown {
  if (!isRecord(source) || !path) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) {
    return source[path];
  }

  const segments = path.split('.');
  const walk = (node: unknown, index: number): unknown => {
    if (index === segments.length) return node;
    if (!isRecord(node)) return undefined;

    for (let end = segments.length; end > index; end--) {
      const key = segments.slice(index, end).join('.');
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        const found = walk(node[key], end);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };

  return walk(source, 0);
}

export function readStringClaim(source: ClaimSource, path: string) {
  const value = readClaim(source, path);
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function readBooleanClaim(source: ClaimSource, path: string) {
  const value = readClaim(source, path);
  if (typeof value === 'boolean') return value;
  // Some providers (for example AWS Cognito) serialize booleans as strings.
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

/**
 * Returns the raw group values for a claim, or null when the claim is
 * absent. Accepts an array of strings or a single string value.
 */
export function readGroupClaim(
  source: ClaimSource,
  path: string,
): string[] | null {
  const value = readClaim(source, path);
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * True when the provider moved the claim out of the token (OIDC distributed
 * claims). Entra ID does this for users in more than 200 groups; the token
 * then carries no groups, so syncing it would wrongly remove memberships.
 */
export function hasDistributedClaim(source: ClaimSource, path: string) {
  const claimNames = isRecord(source) ? source._claim_names : undefined;
  return (
    isRecord(claimNames) &&
    Object.prototype.hasOwnProperty.call(claimNames, path)
  );
}

/**
 * Trims names, strips the leading and trailing slashes Keycloak adds for
 * full group paths, and de-duplicates case-insensitively.
 */
export function normalizeGroupNames(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const name = value.trim().replace(/^\/+|\/+$/g, '');
    if (!name || name.length > MAX_GROUP_NAME_LENGTH) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(name);
  }

  return normalized;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*+/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Case-insensitive wildcard match (`*` and `?`). An empty pattern list
 * matches everything.
 */
export function filterGroupNames(names: string[], patterns: string[]) {
  const active = patterns.map((p) => p.trim()).filter(Boolean);
  if (active.length === 0) return names;

  const matchers = active.map(globToRegExp);
  return names.filter((name) => matchers.some((re) => re.test(name)));
}

export function includesGroup(groups: string[], candidates: string[]) {
  const wanted = new Set(
    candidates.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  return groups.some((group) => wanted.has(group.toLowerCase()));
}

export function isEmailAddress(value: string | null): value is string {
  return !!value && value.length <= 320 && EMAIL_PATTERN.test(value);
}
