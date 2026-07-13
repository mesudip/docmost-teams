import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { entitlementAtom } from "@/ee/entitlement/entitlement-atom";
import { isCloud } from "@/lib/config";
import { isForkTier, hasPaidLicenseTier } from "@/ee/entitlement/tier.utils";

export function useUpgradeLabel(): string {
  const { t } = useTranslation();
  const [entitlements] = useAtom(entitlementAtom);

  if (!isCloud()) {
    if (isForkTier(entitlements?.tier)) {
      return t("Not included in the mesudip-fork tier.");
    }

    return hasPaidLicenseTier(entitlements?.tier)
      ? t("Upgrade your license tier.")
      : t("Available with a paid license");
  }
  return t("Upgrade your plan");
}
