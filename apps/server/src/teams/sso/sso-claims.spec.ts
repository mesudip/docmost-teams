import {
  filterGroupNames,
  hasDistributedClaim,
  includesGroup,
  isEmailAddress,
  normalizeGroupNames,
  readBooleanClaim,
  readClaim,
  readGroupClaim,
} from './sso-claims';

describe('sso claims', () => {
  it('reads top-level, nested, and dotted-key claim paths', () => {
    const claims = {
      groups: ['a'],
      realm_access: { roles: ['admin'] },
      resource_access: { 'my.client': { roles: ['editor'] } },
      'https://example.com/groups': ['x'],
    };

    expect(readClaim(claims, 'groups')).toEqual(['a']);
    expect(readClaim(claims, 'realm_access.roles')).toEqual(['admin']);
    expect(readClaim(claims, 'resource_access.my.client.roles')).toEqual([
      'editor',
    ]);
    expect(readClaim(claims, 'https://example.com/groups')).toEqual(['x']);
    expect(readClaim(claims, 'realm_access.missing')).toBeUndefined();
  });

  it('distinguishes an absent group claim from an empty one', () => {
    expect(readGroupClaim({}, 'groups')).toBeNull();
    expect(readGroupClaim({ groups: [] }, 'groups')).toEqual([]);
    expect(readGroupClaim({ groups: 'Solo' }, 'groups')).toEqual(['Solo']);
    expect(readGroupClaim({ groups: ['a', 1, null] }, 'groups')).toEqual([
      'a',
    ]);
  });

  it('accepts string booleans', () => {
    expect(readBooleanClaim({ v: 'true' }, 'v')).toBe(true);
    expect(readBooleanClaim({ v: false }, 'v')).toBe(false);
    expect(readBooleanClaim({ v: 'yes' }, 'v')).toBeNull();
  });

  it('detects Entra group overage', () => {
    const claims = {
      _claim_names: { groups: 'src1' },
      _claim_sources: { src1: { endpoint: 'https://graph' } },
    };
    expect(hasDistributedClaim(claims, 'groups')).toBe(true);
    expect(hasDistributedClaim({ groups: [] }, 'groups')).toBe(false);
  });

  it('normalizes Keycloak paths and de-duplicates case-insensitively', () => {
    expect(
      normalizeGroupNames(['/Root', 'root', '/Eng/Backend/', '  ', 'x'.repeat(300)]),
    ).toEqual(['Root', 'Eng/Backend']);
  });

  it('filters groups with wildcards and treats regex characters literally', () => {
    const groups = ['docmost-eng', 'Docmost-Ops', 'sales', 'a.b', 'axb'];
    expect(filterGroupNames(groups, [])).toEqual(groups);
    expect(filterGroupNames(groups, ['docmost-*'])).toEqual([
      'docmost-eng',
      'Docmost-Ops',
    ]);
    expect(filterGroupNames(groups, ['a.b'])).toEqual(['a.b']);
    expect(filterGroupNames(groups, ['sale?'])).toEqual(['sales']);
  });

  it('matches role groups case-insensitively', () => {
    expect(includesGroup(['ROOT'], ['Root'])).toBe(true);
    expect(includesGroup(['Root Admin'], ['Root'])).toBe(false);
    expect(includesGroup(['x'], [])).toBe(false);
  });

  it('recognizes email addresses', () => {
    expect(isEmailAddress('user@example.com')).toBe(true);
    expect(isEmailAddress('not-an-email')).toBe(false);
    expect(isEmailAddress(null)).toBe(false);
  });
});
