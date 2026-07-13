import { Button, Divider, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { ISpace } from "@/features/space/types/space.types";
import useUserRole from "@/hooks/use-user-role";
import { SpaceRole } from "@/lib/types";
import {
  ResponsiveSettingsContent,
  ResponsiveSettingsControl,
  ResponsiveSettingsRow,
} from "@/components/ui/responsive-settings-row";
import { useTranslation } from "react-i18next";
import { convertPersonalSpace } from "../services/private-space-service";

type Props = {
  space: ISpace;
};

export function PersonalSpaceConversion({ space }: Props) {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const makePersonal = !space.isPersonal;
  const canMakePersonal = space.memberCount === 1;
  const canConvert = makePersonal
    ? isAdmin
    : space.membership?.role === SpaceRole.ADMIN;

  if (!canConvert) return null;

  const title = makePersonal
    ? t("Make space personal")
    : t("Make workspace space");
  const description = makePersonal
    ? t(
        "Only the single member will be able to access this space. Public share links will be revoked and personal spaces cannot be shared.",
      )
    : t("This makes the space shareable with workspace members again.");

  const convert = async () => {
    try {
      const updated = await convertPersonalSpace({
        spaceId: space.id,
        isPersonal: makePersonal,
      });
      queryClient.setQueryData(["space", space.id], updated);
      queryClient.setQueryData(["space", updated.slug], updated);
      await queryClient.invalidateQueries({ queryKey: ["spaces"] });
      await queryClient.invalidateQueries({
        queryKey: ["spaceMembers", space.id],
      });
      notifications.show({
        message: makePersonal
          ? t("Space made personal")
          : t("Space made shareable"),
      });
      close();
    } catch (error) {
      notifications.show({
        message: error?.response?.data?.message || t("Unable to update space"),
        color: "red",
      });
    }
  };

  return (
    <>
      <Divider my="lg" />
      <ResponsiveSettingsRow>
        <ResponsiveSettingsContent>
          <Text size="md">{title}</Text>
          <Text size="sm" c="dimmed">
            {makePersonal && !canMakePersonal
              ? t(
                  "A space must have exactly one member before it can be made personal.",
                )
              : description}
          </Text>
        </ResponsiveSettingsContent>
        <ResponsiveSettingsControl>
          <Button
            variant={makePersonal ? "default" : "light"}
            onClick={open}
            disabled={makePersonal && !canMakePersonal}
          >
            {title}
          </Button>
        </ResponsiveSettingsControl>
      </ResponsiveSettingsRow>

      <Modal
        opened={opened}
        onClose={close}
        title={title}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <Text size="sm">{description}</Text>
        <Button fullWidth mt="lg" onClick={convert}>
          {title}
        </Button>
      </Modal>
    </>
  );
}
