import { Divider, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconLock, IconPlus } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import classes from "@/components/layouts/global/global-sidebar.module.css";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { Feature } from "@/teams/entitlement/features";
import { useHasFeature } from "@/teams/entitlement/hooks/use-has-feature";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { getSpaceUrl } from "@/lib/config";
import { useMyPersonalSpacesQuery } from "@/teams/private-space/queries/private-space-query";
import CreatePersonalSpaceModal from "./create-private-space-modal";

// Always shown above favorites; personal spaces cannot be unpinned.
export function PinnedPersonalSpaces({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const currentUser = useAtomValue(currentUserAtom);
  const hasPrivateSpaces = useHasFeature(Feature.PERSONAL_SPACES);
  const canCreate =
    hasPrivateSpaces &&
    currentUser?.workspace?.settings?.spaces?.allowPersonal === true;
  const { data: spaces = [], isPending } = useMyPersonalSpacesQuery();
  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);

  if (isPending || (spaces.length === 0 && !canCreate)) {
    return null;
  }

  return (
    <>
      <Divider my="xs" />
      <div className={classes.section}>
        <Text component="h2" className={classes.sectionHeader}>
          {spaces.length > 1 ? t("Personal spaces") : t("Personal space")}
        </Text>

        {spaces.map((space) => (
          <Link
            key={space.id}
            className={classes.spaceItem}
            to={getSpaceUrl(space.slug)}
            onClick={onNavigate}
          >
            <CustomAvatar
              name={space.name}
              avatarUrl={space.logo}
              type={AvatarIconType.SPACE_ICON}
              color="initials"
              variant="filled"
              size={20}
            />
            <Text size="sm" fw={500} lineClamp={1} style={{ flex: 1 }}>
              {space.name}
            </Text>
            <IconLock
              size={14}
              color="var(--mantine-color-gray-6)"
              aria-label={t("Personal space")}
            />
          </Link>
        ))}

        {spaces.length === 0 && (
          <UnstyledButton className={classes.spaceItem} onClick={openCreate}>
            <IconPlus size={16} color="var(--mantine-color-gray-6)" />
            <Text size="sm" c="dimmed">
              {t("Create personal space")}
            </Text>
          </UnstyledButton>
        )}
      </div>

      {canCreate && (
        <CreatePersonalSpaceModal opened={createOpened} onClose={closeCreate} />
      )}
    </>
  );
}
