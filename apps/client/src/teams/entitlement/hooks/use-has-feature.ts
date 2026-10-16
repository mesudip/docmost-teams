import { useAtomValue } from "jotai";
import { entitlementAtom } from "../entitlement-atom";
import { Entitlements } from "../entitlement.types";
import { FeatureKey } from "../features";

export function hasFeature(
  entitlements: Entitlements | null | undefined,
  feature: FeatureKey,
): boolean {
  const features = entitlements?.features;
  return Array.isArray(features) && features.includes(feature);
}

// True only when the loaded entitlements list the feature. Until they load,
// every feature counts as not granted.
export function useHasFeature(feature: FeatureKey): boolean {
  const entitlements = useAtomValue(entitlementAtom);
  return hasFeature(entitlements, feature);
}
