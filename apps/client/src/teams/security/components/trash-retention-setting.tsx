import { useEffect, useState } from "react";
import { Button, Group, NumberInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useUpdateWorkspaceSetting } from "@/teams/shared/hooks/use-update-workspace-setting";
import { SettingRow } from "./setting-row";

// The server uses 30 days when the workspace has no value.
export const DEFAULT_TRASH_RETENTION_DAYS = 30;

export function isValidRetentionDays(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function TrashRetentionSetting() {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const updateSetting = useUpdateWorkspaceSetting();
  const savedDays =
    workspace?.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS;

  const [days, setDays] = useState<string | number>(savedDays);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDays(savedDays);
  }, [savedDays]);

  const valid = isValidRetentionDays(days);
  const changed = valid && days !== savedDays;

  const handleSave = async () => {
    if (!isValidRetentionDays(days)) return;
    setSaving(true);
    const updated = await updateSetting({ trashRetentionDays: days });
    setSaving(false);
    if (updated) {
      notifications.show({ message: t("Trash retention saved") });
    }
  };

  return (
    <SettingRow
      title={t("Trash retention")}
      description={t(
        "Pages stay in the trash for this many days before they are deleted permanently. The default is {{count}} days.",
        { count: DEFAULT_TRASH_RETENTION_DAYS },
      )}
    >
      <Group mt="sm" align="flex-start" gap="sm">
        <NumberInput
          aria-label={t("Days in trash")}
          value={days}
          onChange={(value) =>
            setDays(typeof value === "bigint" ? Number(value) : value)
          }
          min={1}
          step={1}
          allowDecimal={false}
          allowNegative={false}
          suffix={` ${t("days")}`}
          w={160}
          error={
            days !== "" && !valid
              ? t("Enter a whole number of at least 1")
              : null
          }
        />
        <Button onClick={handleSave} disabled={!changed} loading={saving}>
          {t("Save")}
        </Button>
      </Group>
    </SettingRow>
  );
}
