import { Kysely, Transaction } from 'kysely';
import { Generated, Timestamp } from '@docmost/db/types/db';
import { DbInterface } from '@docmost/db/types/db.interface';

// docmost-teams tables. They are declared here rather than in the generated
// db.d.ts so upstream regenerations of that file never conflict with them.

// A row marks a group membership as assigned by an identity provider. Rows
// cascade away with their membership; memberships without a row were
// assigned in Docmost and are never removed by sync. A null provider means
// the provider was deleted, and the next syncing provider adopts the row.
export interface SsoGroupMemberships {
  authProviderId: string | null;
  createdAt: Generated<Timestamp>;
  groupUserId: string;
  workspaceId: string;
}

// A row means the user's current role was granted by an identity provider.
// `previousRole` is restored when the provider stops granting it.
export interface SsoRoleGrants {
  authProviderId: string | null;
  createdAt: Generated<Timestamp>;
  previousRole: string;
  role: string;
  updatedAt: Generated<Timestamp>;
  userId: string;
  workspaceId: string;
}

export interface SsoSyncTables {
  ssoGroupMemberships: SsoGroupMemberships;
  ssoRoleGrants: SsoRoleGrants;
}

export type SsoDB = Kysely<DbInterface & SsoSyncTables>;
export type SsoTransaction = Transaction<DbInterface & SsoSyncTables>;
