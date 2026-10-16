import { useState } from "react";
import { Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import {
  ResponsiveSettingsContent,
  ResponsiveSettingsControl,
  ResponsiveSettingsRow,
} from "@/components/ui/responsive-settings-row.tsx";
import { Feature } from "@/teams/entitlement/features";
import { useHasFeature } from "@/teams/entitlement/hooks/use-has-feature";
import { useUpdateWorkspaceSetting } from "@/teams/shared/hooks/use-update-workspace-setting";

// Settings → General: lets members create private ("personal") spaces.
export default function PrivateSpacesSetting() {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const available = useHasFeature(Feature.PERSONAL_SPACES);
  const updateSetting = useUpdateWorkspaceSetting();
  const [saving, setSaving] = useState(false);

  if (!available) return null;

  const allowed = workspace?.settings?.spaces?.allowPersonal === true;

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    setSaving(true);
    const updated = await updateSetting({ allowPersonalSpaces: value });
    setSaving(false);
    if (updated) {
      notifications.show({
        message: value
          ? t("Members can now create personal spaces")
          : t("Members can no longer create personal spaces"),
      });
    }
  };

  return (
    <ResponsiveSettingsRow>
      <ResponsiveSettingsContent>
        <Text size="md">{t("Personal spaces")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Let members create private spaces of their own. Only the member who creates a personal space can see it; workspace admins and owners can't open it. Turning this off keeps existing personal spaces.",
          )}
        </Text>
      </ResponsiveSettingsContent>
      <ResponsiveSettingsControl>
        <Switch
          checked={allowed}
          onChange={handleChange}
          disabled={saving}
          aria-label={t("Allow personal spaces")}
        />
      </ResponsiveSettingsControl>
    </ResponsiveSettingsRow>
  );
}
