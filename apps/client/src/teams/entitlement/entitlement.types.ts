// Tier reported by a self-hosted docmost-teams server
// (apps/server/src/teams/features.ts).
export const TEAMS_TIER = "docmost-teams";

// Other servers may report other tiers, so the type stays open.
export type Tier = typeof TEAMS_TIER | "free" | "standard" | (string & {});

// Response of POST /api/workspace/entitlements.
export interface Entitlements {
  cloud: boolean;
  tier: Tier;
  features: string[];
}
