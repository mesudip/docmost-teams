import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { z } from "zod/v4";
import { getApiErrorMessage } from "@/lib/api-error.ts";
import { getSpaceUrl } from "@/lib/config.ts";
import { useCreatePersonalSpaceMutation } from "../queries/private-space-query";

type PrivateSpaceFormProps = {
  onCreated?: () => void;
};

// Same limits as the server's CreatePrivateSpaceDto.
const NAME_MIN = 2;
const NAME_MAX = 100;

export function PrivateSpaceForm({ onCreated }: PrivateSpaceFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMutation = useCreatePersonalSpaceMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(NAME_MIN, {
            message: t("Use at least {{count}} characters", {
              count: NAME_MIN,
            }),
          })
          .max(NAME_MAX, {
            message: t("Use at most {{count}} characters", { count: NAME_MAX }),
          }),
      }),
    [t],
  );

  const form = useForm<{ name: string }>({
    initialValues: { name: "" },
    validate: zod4Resolver(schema),
  });

  const handleSubmit = async ({ name }: { name: string }) => {
    setServerError(null);
    try {
      const space = await createMutation.mutateAsync({ name: name.trim() });
      onCreated?.();
      notifications.show({ message: t("Personal space created") });
      navigate(getSpaceUrl(space.slug));
    } catch (err) {
      setServerError(
        getApiErrorMessage(err, t("Could not create the personal space")),
      );
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        <Text size="sm" c="dimmed">
          {t(
            "Only you can see a personal space. Workspace admins and owners can't open it.",
          )}
        </Text>

        <TextInput
          withAsterisk
          id="private-space-name"
          label={t("Space name")}
          placeholder={t("e.g. My notes")}
          variant="filled"
          data-autofocus
          errorProps={{ role: "alert" }}
          {...form.getInputProps("name")}
        />

        {serverError && (
          <Alert
            variant="light"
            color="red"
            icon={<IconAlertCircle aria-hidden />}
          >
            {serverError}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button type="submit" loading={createMutation.isPending}>
            {t("Create")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

type CreatePrivateSpaceModalProps = {
  opened: boolean;
  onClose: () => void;
};

export default function CreatePrivateSpaceModal({
  opened,
  onClose,
}: CreatePrivateSpaceModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Create personal space")}
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <PrivateSpaceForm onCreated={onClose} />
    </Modal>
  );
}
