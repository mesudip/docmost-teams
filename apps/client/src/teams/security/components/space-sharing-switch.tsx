import { Switch, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useUpdateSpaceMutation } from "@/features/space/queries/space-query.ts";
import { ISpace } from "@/features/space/types/space.types.ts";
import { Feature } from "@/teams/entitlement/features";
import { useHasFeature } from "@/teams/entitlement/hooks/use-has-feature";
import { SettingRow } from "./setting-row";

type SpaceSharingSwitchProps = {
  space: ISpace;
};

// Space settings → Security: turn public sharing off for one space.
export default function SpaceSharingSwitch({ space }: SpaceSharingSwitchProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const workspace = useAtomValue(workspaceAtom);
  const canManage = useHasFeature(Feature.SECURITY_SETTINGS);
  const updateSpaceMutation = useUpdateSpaceMutation();

  if (!space || !canManage) return null;

  const isPrivate = space.isPersonal === true;
  const disabledForWorkspace = workspace?.settings?.sharing?.disabled === true;
  const disabledForSpace = space.settings?.sharing?.disabled === true;
  // A space converted back from private keeps sharing disabled; the switch
  // stays usable so a space admin can turn sharing on again.
  const locked = isPrivate || disabledForWorkspace;

  const apply = async (disable: boolean) => {
    try {
      await updateSpaceMutation.mutateAsync({
        spaceId: space.id,
        disablePublicSharing: disable,
      });
      if (disable) {
        queryClient.invalidateQueries({
          predicate: (query) =>
            ["share-list", "share-for-page"].includes(
              query.queryKey[0] as string,
            ),
        });
      }
    } catch {
      // The mutation already shows the server's message.
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const disable = event.currentTarget.checked;
    if (!disable) {
      apply(false);
      return;
    }

    modals.openConfirmModal({
      title: t("Turn off public sharing in this space?"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "Public links to pages in this space are deleted right away, and its pages can't be shared until you turn sharing back on.",
          )}
        </Text>
      ),
      labels: { confirm: t("Turn off sharing"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => apply(true),
    });
  };

  let reason: string | null = null;
  if (isPrivate) {
    reason = t("Private spaces can never be shared publicly.");
  } else if (disabledForWorkspace) {
    reason = t(
      "Public sharing is turned off for the whole workspace in Settings → Security & SSO.",
    );
  }

  return (
    <SettingRow
      title={t("Disable public sharing")}
      description={
        <>
          {t("Stop pages in this space from being shared publicly on the web.")}
          {reason && (
            <Text size="sm" c="dimmed" fs="italic" mt={4}>
              {reason}
            </Text>
          )}
        </>
      }
      control={
        <Switch
          checked={locked || disabledForSpace}
          onChange={handleChange}
          disabled={locked || updateSpaceMutation.isPending}
          aria-label={t("Disable public sharing in this space")}
        />
      }
    />
  );
}
