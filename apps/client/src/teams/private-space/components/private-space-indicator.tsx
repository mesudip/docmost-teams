import { Tooltip } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface PrivateSpaceIndicatorProps {
  isPrivate?: boolean;
}

export function PrivateSpaceIndicator({
  isPrivate,
}: PrivateSpaceIndicatorProps) {
  const { t } = useTranslation();

  if (!isPrivate) return null;

  return (
    <Tooltip label={t("Private space")} withArrow>
      <IconLock size={14} color="var(--mantine-color-gray-6)" />
    </Tooltip>
  );
}
