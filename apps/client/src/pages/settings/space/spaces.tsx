import SettingsTitle from "@/components/settings/settings-title.tsx";
import SpaceList from "@/features/space/components/space-list.tsx";
import { Group } from "@mantine/core";
import { SpaceCreationAction } from "@/teams/private-space/components/space-creation-action";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";

export default function Spaces() {
  const { t } = useTranslation();

  return (
    <>
      <DocumentTitle title={t("Spaces")} />
      <SettingsTitle title={t("Spaces")} />

      <Group my="md" justify="flex-end">
        <SpaceCreationAction />
      </Group>

      <SpaceList />
    </>
  );
}
