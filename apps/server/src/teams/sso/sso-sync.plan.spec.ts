import { UserRole } from '../../common/helpers/types/permission';
import {
  MembershipState,
  planGroupSync,
  planRoleSync,
} from './sso-sync.plan';

const P = 'provider-a';
const OTHER = 'provider-b';

describe('planGroupSync', () => {
  const membership = (
    groupId: string,
    tracked: boolean,
    authProviderId: string | null = P,
  ): MembershipState => ({
    groupUserId: `gu-${groupId}`,
    groupId,
    tracked,
    authProviderId: tracked ? authProviderId : null,
  });

  it('adds missing memberships and removes provider-assigned ones', () => {
    const plan = planGroupSync({
      providerId: P,
      desiredGroupIds: new Set(['eng', 'ops']),
      memberships: [membership('eng', true), membership('sales', true)],
    });

    expect(plan.addGroupIds).toEqual(['ops']);
    expect(plan.remove.map((m) => m.groupId)).toEqual(['sales']);
  });

  it('never removes memberships assigned in Docmost', () => {
    const plan = planGroupSync({
      providerId: P,
      desiredGroupIds: new Set(),
      memberships: [membership('manual', false)],
    });

    expect(plan.remove).toEqual([]);
  });

  it('keeps a manual membership manual when the provider also grants it', () => {
    const plan = planGroupSync({
      providerId: P,
      desiredGroupIds: new Set(['eng']),
      memberships: [membership('eng', false)],
    });

    expect(plan).toEqual({ addGroupIds: [], adoptGroupUserIds: [], remove: [] });
  });

  it('leaves memberships owned by another provider alone', () => {
    const plan = planGroupSync({
      providerId: P,
      desiredGroupIds: new Set(),
      memberships: [membership('eng', true, OTHER)],
    });

    expect(plan.remove).toEqual([]);
  });

  it('adopts or removes memberships whose provider was deleted', () => {
    const plan = planGroupSync({
      providerId: P,
      desiredGroupIds: new Set(['eng']),
      memberships: [membership('eng', true, null), membership('old', true, null)],
    });

    expect(plan.adoptGroupUserIds).toEqual(['gu-eng']);
    expect(plan.remove.map((m) => m.groupId)).toEqual(['old']);
  });
});

describe('planRoleSync', () => {
  const grant = (role: UserRole, previousRole: UserRole, provider = P) => ({
    role,
    previousRole,
    authProviderId: provider,
  });

  it('promotes and records the previous role', () => {
    expect(
      planRoleSync({
        currentRole: UserRole.MEMBER,
        grant: null,
        mappedRole: UserRole.OWNER,
        providerId: P,
      }),
    ).toEqual({
      kind: 'apply',
      targetRole: UserRole.OWNER,
      grant: { role: UserRole.OWNER, previousRole: UserRole.MEMBER },
    });
  });

  it('restores the previous role when the provider stops granting it', () => {
    expect(
      planRoleSync({
        currentRole: UserRole.OWNER,
        grant: grant(UserRole.OWNER, UserRole.ADMIN),
        mappedRole: null,
        providerId: P,
      }),
    ).toEqual({ kind: 'apply', targetRole: UserRole.ADMIN, grant: null });
  });

  it('moves between granted roles without losing the previous role', () => {
    expect(
      planRoleSync({
        currentRole: UserRole.OWNER,
        grant: grant(UserRole.OWNER, UserRole.MEMBER),
        mappedRole: UserRole.ADMIN,
        providerId: P,
      }),
    ).toEqual({
      kind: 'apply',
      targetRole: UserRole.ADMIN,
      grant: { role: UserRole.ADMIN, previousRole: UserRole.MEMBER },
    });
  });

  it('never demotes a role assigned in Docmost', () => {
    expect(
      planRoleSync({
        currentRole: UserRole.OWNER,
        grant: null,
        mappedRole: UserRole.ADMIN,
        providerId: P,
      }),
    ).toEqual({ kind: 'skip' });
    expect(
      planRoleSync({
        currentRole: UserRole.ADMIN,
        grant: null,
        mappedRole: null,
        providerId: P,
      }),
    ).toEqual({ kind: 'skip' });
  });

  it('treats a role changed in Docmost after the grant as manual', () => {
    expect(
      planRoleSync({
        currentRole: UserRole.ADMIN,
        grant: grant(UserRole.OWNER, UserRole.MEMBER),
        mappedRole: null,
        providerId: P,
      }),
    ).toEqual({ kind: 'apply', targetRole: UserRole.ADMIN, grant: null });
  });

  it('ignores roles granted by another provider', () => {
    expect(
      planRoleSync({
        currentRole: UserRole.OWNER,
        grant: grant(UserRole.OWNER, UserRole.MEMBER, OTHER),
        mappedRole: null,
        providerId: P,
      }),
    ).toEqual({ kind: 'skip' });
  });

  it('adopts grants whose provider was deleted', () => {
    expect(
      planRoleSync({
        currentRole: UserRole.OWNER,
        grant: { ...grant(UserRole.OWNER, UserRole.MEMBER), authProviderId: null },
        mappedRole: null,
        providerId: P,
      }),
    ).toEqual({ kind: 'apply', targetRole: UserRole.MEMBER, grant: null });
  });
});
