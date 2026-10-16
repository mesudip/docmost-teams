import { useState } from "react";
import { Alert, Button, Group, Loader, Menu, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconChevronDown,
  IconPlus,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { v7 as uuidv7 } from "uuid";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { getApiErrorMessage } from "@/lib/api-error.ts";
import { ISsoProvider, SSO_PRESETS, SsoPreset } from "../sso.types";
import { getPresetLabel } from "../sso-presets";
import { wouldLockOut } from "../lockout";
import { useDeleteSsoProviderMutation } from "../queries/sso-provider-query";
import { SsoProviderIcon } from "./sso-provider-icon";
import { SsoProviderList } from "./sso-provider-list";
import { SsoEditorTarget, SsoProviderEditor } from "./sso-provider-editor";

type SsoProvidersSectionProps = {
  providers: ISsoProvider[];
  isLoading: boolean;
  error: Error | null;
};

export function SsoProvidersSection({
  providers,
  isLoading,
  error,
}: SsoProvidersSectionProps) {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  // The server lets admins view providers but only owners change them.
  const { isOwner } = useUserRole();
  const deleteMutation = useDeleteSsoProviderMutation();
  const [editorTarget, setEditorTarget] = useState<SsoEditorTarget | null>(
    null,
  );

  const enforceSso = workspace?.enforceSso === true;

  const openDraft = (preset: SsoPreset) => {
    setEditorTarget({ kind: "draft", id: uuidv7(), preset });
  };

  const handleDelete = (provider: ISsoProvider) => {
    if (wouldLockOut(enforceSso, providers, provider.id)) {
      notifications.show({
        color: "orange",
        title: t("Turn off Enforce SSO first"),
        message: t(
          "{{name}} is the only enabled provider and Enforce SSO is on. Deleting it would lock everyone out.",
          { name: provider.name },
        ),
      });
      return;
    }

    modals.openConfirmModal({
      title: t("Delete {{name}}?", { name: provider.name }),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "People can no longer sign in with this provider. Their accounts stay, and they can still sign in another way if one is available.",
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteMutation.mutateAsync(provider.id);
          notifications.show({ message: t("SSO provider deleted") });
        } catch (err) {
          notifications.show({
            color: "red",
            message: getApiErrorMessage(
              err,
              t("Could not delete the provider"),
            ),
          });
        }
      },
    });
  };

  return (
    <div>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xl">
        <div>
          <Text size="md" fw={500}>
            {t("Single sign-on providers")}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "Let people sign in through an OpenID Connect identity provider such as Keycloak, Google, Microsoft Entra ID or Facebook.",
            )}
          </Text>
          {!isOwner && (
            <Text size="sm" c="dimmed" mt="xs">
              {t(
                "Only workspace owners can add or change SSO providers, because a provider decides who can sign in to which account.",
              )}
            </Text>
          )}
        </div>

        {isOwner && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                leftSection={<IconPlus size={16} aria-hidden />}
                rightSection={<IconChevronDown size={14} aria-hidden />}
                style={{ flexShrink: 0 }}
              >
                {t("Add provider")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {SSO_PRESETS.map((preset) => (
                <Menu.Item
                  key={preset}
                  leftSection={<SsoProviderIcon preset={preset} />}
                  onClick={() => openDraft(preset)}
                >
                  {getPresetLabel(preset, t)}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      {isLoading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : error ? (
        <Alert
          mt="md"
          variant="light"
          color="red"
          icon={<IconAlertCircle aria-hidden />}
        >
          {getApiErrorMessage(error, t("Could not load the SSO providers"))}
        </Alert>
      ) : (
        <SsoProviderList
          providers={providers}
          onEdit={(provider) => setEditorTarget({ kind: "saved", provider })}
          onDelete={handleDelete}
          readOnly={!isOwner}
        />
      )}

      {editorTarget && (
        <SsoProviderEditor
          key={
            editorTarget.kind === "draft"
              ? editorTarget.id
              : editorTarget.provider.id
          }
          target={editorTarget}
          providers={providers}
          onClose={() => setEditorTarget(null)}
        />
      )}
    </div>
  );
}
