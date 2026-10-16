import { TEAMS_TIER, Tier } from "./entitlement.types";

export function isForkTier(tier?: Tier | null): boolean {
  return tier === TEAMS_TIER;
}

export function hasPaidLicenseTier(tier?: Tier | null): boolean {
  return !!tier && tier !== "free" && !isForkTier(tier);
}
