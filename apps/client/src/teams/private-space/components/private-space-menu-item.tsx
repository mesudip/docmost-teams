import { Menu } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconLock } from "@tabler/icons-react";
import { Feature } from "@/ee/features";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import CreatePrivateSpaceModal from "./create-private-space-modal";

export function PrivateSpaceMenuItem() {
  const { t } = useTranslation();
  const currentUser = useAtomValue(currentUserAtom);
  const hasPrivateSpaces = useHasFeature(Feature.PERSONAL_SPACES);
  const settingEnabled =
    currentUser?.workspace?.settings?.spaces?.allowPersonal === true;
  const [opened, { open, close }] = useDisclosure(false);

  if (!hasPrivateSpaces || !settingEnabled) return null;

  return (
    <>
      <Menu.Item
        onClick={open}
        leftSection={<IconLock size={16} color="var(--mantine-color-gray-6)" />}
      >
        {t("Create private space")}
      </Menu.Item>
      <CreatePrivateSpaceModal opened={opened} onClose={close} />
    </>
  );
}
