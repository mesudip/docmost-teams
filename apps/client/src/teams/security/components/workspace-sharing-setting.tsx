import { useState } from "react";
import { Switch, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useUpdateWorkspaceSetting } from "@/teams/shared/hooks/use-update-workspace-setting";
import { SettingRow } from "./setting-row";

// Workspace-wide switch that turns public page sharing off.
export function WorkspaceSharingSetting() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const workspace = useAtomValue(workspaceAtom);
  const updateSetting = useUpdateWorkspaceSetting();
  const [saving, setSaving] = useState(false);

  const sharingDisabled = workspace?.settings?.sharing?.disabled === true;

  const apply = async (disable: boolean) => {
    setSaving(true);
    const updated = await updateSetting({ disablePublicSharing: disable });
    setSaving(false);
    if (!updated) return;

    // Disabling deletes every share on the server.
    queryClient.invalidateQueries({
      predicate: (query) =>
        ["share-list", "share-for-page"].includes(query.queryKey[0] as string),
    });
    notifications.show({
      message: disable
        ? t("Public sharing is turned off")
        : t("Public sharing is turned on"),
    });
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const disable = event.currentTarget.checked;
    modals.openConfirmModal({
      title: disable
        ? t("Turn off public sharing?")
        : t("Turn public sharing back on?"),
      centered: true,
      children: (
        <Text size="sm">
          {disable
            ? t(
                "Every public link to a page in this workspace is deleted right away, and pages can't be shared publicly until you turn sharing back on.",
              )
            : t(
                "Members can share pages publicly again, except in spaces where a space admin turned sharing off. Links deleted earlier don't come back.",
              )}
        </Text>
      ),
      labels: {
        confirm: disable ? t("Turn off sharing") : t("Turn on sharing"),
        cancel: t("Cancel"),
      },
      confirmProps: disable ? { color: "red" } : undefined,
      onConfirm: () => apply(disable),
    });
  };

  return (
    <SettingRow
      title={t("Disable public sharing")}
      description={t(
        "Stop pages in this workspace from being shared publicly on the web. Space admins can also turn sharing off for a single space.",
      )}
      control={
        <Switch
          checked={sharingDisabled}
          onChange={handleChange}
          disabled={saving}
          aria-label={t("Disable public sharing")}
        />
      }
    />
  );
}
