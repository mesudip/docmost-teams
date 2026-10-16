import { UserRole } from '../../common/helpers/types/permission';

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.MEMBER]: 0,
  [UserRole.ADMIN]: 1,
  [UserRole.OWNER]: 2,
};

export function normalizeRole(role: string | null | undefined): UserRole {
  return role === UserRole.OWNER || role === UserRole.ADMIN
    ? role
    : UserRole.MEMBER;
}

export type MembershipState = {
  groupUserId: string;
  groupId: string;
  // false when the membership was assigned in Docmost
  tracked: boolean;
  authProviderId: string | null;
};

export type GroupSyncPlan = {
  addGroupIds: string[];
  adoptGroupUserIds: string[];
  remove: MembershipState[];
};

/**
 * Provider-assigned memberships follow the claim. Memberships assigned in
 * Docmost are never removed, and those owned by a different provider are
 * left alone. Rows whose provider was deleted are adopted.
 */
export function planGroupSync(opts: {
  desiredGroupIds: Set<string>;
  memberships: MembershipState[];
  providerId: string;
}): GroupSyncPlan {
  const byGroupId = new Map(opts.memberships.map((m) => [m.groupId, m]));
  const ownedByThisProvider = (m: MembershipState) =>
    m.tracked &&
    (m.authProviderId === null || m.authProviderId === opts.providerId);

  const addGroupIds: string[] = [];
  const adoptGroupUserIds: string[] = [];

  for (const groupId of opts.desiredGroupIds) {
    const existing = byGroupId.get(groupId);
    if (!existing) {
      addGroupIds.push(groupId);
    } else if (existing.tracked && existing.authProviderId === null) {
      adoptGroupUserIds.push(existing.groupUserId);
    }
  }

  const remove = opts.memberships.filter(
    (m) => ownedByThisProvider(m) && !opts.desiredGroupIds.has(m.groupId),
  );

  return { addGroupIds, adoptGroupUserIds, remove };
}

export type RoleGrantState = {
  role: string;
  previousRole: string;
  authProviderId: string | null;
};

export type RoleSyncPlan =
  | { kind: 'skip' }
  | {
      kind: 'apply';
      targetRole: UserRole;
      // null removes any existing grant
      grant: { role: UserRole; previousRole: UserRole } | null;
    };

/**
 * A provider may raise a role and later take back only what it granted,
 * restoring the role the user had before. A role changed in Docmost after
 * the grant counts as manual: the stale grant is dropped and the provider
 * can only raise the role again from there.
 */
export function planRoleSync(opts: {
  currentRole: string | null;
  grant: RoleGrantState | null;
  mappedRole: UserRole | null;
  providerId: string;
}): RoleSyncPlan {
  const currentRole = normalizeRole(opts.currentRole);
  const { grant, mappedRole } = opts;

  if (grant?.authProviderId && grant.authProviderId !== opts.providerId) {
    return { kind: 'skip' };
  }

  const activeGrant =
    grant && normalizeRole(grant.role) === currentRole ? grant : null;
  const baseRole = activeGrant
    ? normalizeRole(activeGrant.previousRole)
    : currentRole;
  const targetRole =
    mappedRole && ROLE_RANK[mappedRole] > ROLE_RANK[baseRole]
      ? mappedRole
      : baseRole;
  const nextGrant =
    targetRole !== baseRole ? { role: targetRole, previousRole: baseRole } : null;

  if (!grant && !nextGrant) {
    return { kind: 'skip' };
  }

  return { kind: 'apply', targetRole, grant: nextGrant };
}
