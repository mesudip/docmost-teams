import { Tier } from "@/ee/entitlement/entitlement.types";

export function isForkTier(tier?: Tier | null): boolean {
  return tier === "docmost-teams";
}

export function hasPaidLicenseTier(tier?: Tier | null): boolean {
  return !!tier && tier !== "free" && !isForkTier(tier);
}
