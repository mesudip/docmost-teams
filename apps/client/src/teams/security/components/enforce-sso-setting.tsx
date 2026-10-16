import { useState } from "react";
import { Switch, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { ISsoProvider } from "../sso/sso.types";
import { countSignInProviders } from "../sso/lockout";
import { useUpdateWorkspaceSetting } from "@/teams/shared/hooks/use-update-workspace-setting";
import { SettingRow } from "./setting-row";

type EnforceSsoSettingProps = {
  providers: ISsoProvider[];
  providersLoading?: boolean;
};

export function EnforceSsoSetting({
  providers,
  providersLoading = false,
}: EnforceSsoSettingProps) {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const updateSetting = useUpdateWorkspaceSetting();
  const [saving, setSaving] = useState(false);

  const enforced = workspace?.enforceSso === true;
  const canEnable = countSignInProviders(providers) > 0;

  const apply = async (value: boolean) => {
    setSaving(true);
    const updated = await updateSetting({ enforceSso: value });
    setSaving(false);
    if (updated) {
      notifications.show({
        message: value
          ? t("Single sign-on is now required")
          : t("Single sign-on is no longer required"),
      });
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    if (!value) {
      apply(false);
      return;
    }

    modals.openConfirmModal({
      title: t("Require single sign-on?"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "Everyone, admins included, will have to sign in through an SSO provider. Password sign-in, password reset and sign-up through password invitations stop working. Test an enabled provider before you continue.",
          )}
        </Text>
      ),
      labels: { confirm: t("Require SSO"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => apply(true),
    });
  };

  return (
    <SettingRow
      title={t("Enforce SSO")}
      description={
        <>
          {t(
            "Allow sign-in only through single sign-on. Password sign-in, password reset and sign-up through password invitations stop working for everyone, so make sure an enabled provider works first.",
          )}
          {!enforced && !canEnable && !providersLoading && (
            <Text size="sm" c="orange.8" mt={4}>
              {t("Enable at least one SSO provider before turning this on.")}
            </Text>
          )}
        </>
      }
      control={
        <Switch
          checked={enforced}
          onChange={handleChange}
          disabled={saving || (!enforced && !canEnable)}
          aria-label={t("Enforce SSO")}
        />
      }
    />
  );
}
