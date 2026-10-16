import { useTranslation } from "react-i18next";

// Tooltip for controls whose feature the server does not grant.
export function useEditionLabel(): string {
  const { t } = useTranslation();
  return t("Not included in docmost-teams");
}
