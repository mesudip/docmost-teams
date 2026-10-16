import React from "react";
import { Group, Paper, Text, ThemeIcon } from "@mantine/core";
import { IconTable } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

type BaseViewProps = {
  pageId: string;
  embedded?: boolean;
  editable?: boolean;
  titleSlot?: React.ReactNode;
};

// Stands in for database pages ("bases"), which docmost-teams can't show.
export function BaseView({ titleSlot }: BaseViewProps) {
  const { t } = useTranslation();

  return (
    <div>
      {titleSlot}
      <Paper withBorder radius="md" p="md" my="xs">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon variant="light" color="gray" radius="md">
            <IconTable size={18} aria-hidden />
          </ThemeIcon>
          <div>
            <Text size="sm" fw={500}>
              {t("Databases are not available")}
            </Text>
            <Text size="sm" c="dimmed">
              {t(
                "Database pages (bases) are not part of docmost-teams, so this content can't be shown.",
              )}
            </Text>
          </div>
        </Group>
      </Paper>
    </div>
  );
}
