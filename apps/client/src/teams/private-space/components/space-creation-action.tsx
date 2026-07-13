import {
  Button,
  Divider,
  Modal,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Feature } from "@/ee/features";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { CreateSpaceForm } from "@/features/space/components/create-space-form";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import useUserRole from "@/hooks/use-user-role";
import { useAtomValue } from "jotai";
import { PrivateSpaceForm } from "./create-private-space-modal";

type SpaceVisibility = "everyone" | "private";

export function SpaceCreationAction() {
  const { t } = useTranslation();
  const currentUser = useAtomValue(currentUserAtom);
  const { isAdmin } = useUserRole();
  const hasPrivateSpaces = useHasFeature(Feature.PERSONAL_SPACES);
  const privateSpacesEnabled =
    hasPrivateSpaces &&
    currentUser?.workspace?.settings?.spaces?.allowPersonal === true;
  const [opened, { open, close }] = useDisclosure(false);
  const [visibility, setVisibility] = useState<SpaceVisibility>("everyone");

  if (!isAdmin && !privateSpacesEnabled) return null;

  const selectedVisibility = !privateSpacesEnabled
    ? "everyone"
    : isAdmin
      ? visibility
      : "private";
  const actionLabel = isAdmin ? t("Create space") : t("Create personal space");

  return (
    <>
      <Button onClick={open}>{actionLabel}</Button>
      <Modal
        opened={opened}
        onClose={close}
        title={actionLabel}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <Divider size="xs" mb="md" />
        {privateSpacesEnabled && isAdmin && (
          <Stack gap={6} mb="md">
            <Text size="sm" fw={500}>
              {t("Who can access this space?")}
            </Text>
            <SegmentedControl
              fullWidth
              value={visibility}
              onChange={(value) => setVisibility(value as SpaceVisibility)}
              data={[
                { value: "everyone", label: t("For everyone") },
                { value: "private", label: t("Personal") },
              ]}
            />
          </Stack>
        )}
        {selectedVisibility === "private" ? (
          <PrivateSpaceForm onCreated={close} />
        ) : (
          <CreateSpaceForm />
        )}
      </Modal>
    </>
  );
}
