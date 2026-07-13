import SettingsTitle from "@/components/settings/settings-title.tsx";
import SpaceList from "@/features/space/components/space-list.tsx";
import { Group } from "@mantine/core";
import { SpaceCreationAction } from "@/teams/private-space/components/space-creation-action";
import { Helmet } from "react-helmet-async";
import { getAppName } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";

export default function Spaces() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>
          {t("Spaces")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Spaces")} />

      <Group my="md" justify="flex-end">
        <SpaceCreationAction />
      </Group>

      <SpaceList />
    </>
  );
}
