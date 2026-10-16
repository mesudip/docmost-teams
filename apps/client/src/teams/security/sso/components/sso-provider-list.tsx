import {
  ActionIcon,
  Badge,
  Group,
  Table,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ISsoProvider, SSO_PROVIDER_TYPE } from "../sso.types";
import { getPresetLabel, presetSupportsGroups } from "../sso-presets";
import { getProviderPreset } from "../provider-form";
import { SsoProviderIcon } from "./sso-provider-icon";

type SsoProviderListProps = {
  providers: ISsoProvider[];
  onEdit: (provider: ISsoProvider) => void;
  onDelete: (provider: ISsoProvider) => void;
  // Hides the edit and delete actions.
  readOnly?: boolean;
};

function OnOff({ on }: { on: boolean }) {
  const { t } = useTranslation();
  return (
    <Text size="sm" c={on ? undefined : "dimmed"}>
      {on ? t("On") : t("Off")}
    </Text>
  );
}

export function SsoProviderList({
  providers,
  onEdit,
  onDelete,
  readOnly = false,
}: SsoProviderListProps) {
  const { t } = useTranslation();

  if (providers.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="md">
        {t(
          "No SSO providers yet. Add one to let people sign in with your identity provider.",
        )}
      </Text>
    );
  }

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Provider")}</Table.Th>
            <Table.Th>{t("Status")}</Table.Th>
            <Table.Th>{t("Sign-up")}</Table.Th>
            <Table.Th>{t("Group sync")}</Table.Th>
            <Table.Th>
              <VisuallyHidden>{t("Actions")}</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {providers.map((provider) => {
            const supported = provider.type === SSO_PROVIDER_TYPE;
            const preset = getProviderPreset(provider);
            return (
              <Table.Tr key={provider.id}>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <SsoProviderIcon
                      preset={supported ? preset : null}
                      size={20}
                    />
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {provider.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {supported
                          ? getPresetLabel(preset, t)
                          : t("{{type}} (not supported here)", {
                              type: provider.type.toUpperCase(),
                            })}
                      </Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  {provider.isEnabled ? (
                    <Badge variant="light" color="teal">
                      {t("Enabled")}
                    </Badge>
                  ) : (
                    <Badge variant="light" color="gray">
                      {t("Disabled")}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <OnOff on={provider.allowSignup} />
                </Table.Td>
                <Table.Td>
                  {supported && presetSupportsGroups(preset) ? (
                    <OnOff on={provider.groupSync} />
                  ) : (
                    <Text size="sm" c="dimmed">
                      {t("Not available")}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {!readOnly && (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      {supported && (
                        <Tooltip label={t("Edit")} withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            onClick={() => onEdit(provider)}
                            aria-label={t("Edit {{name}}", {
                              name: provider.name,
                            })}
                          >
                            <IconPencil size={18} aria-hidden />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip label={t("Delete")} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => onDelete(provider)}
                          aria-label={t("Delete {{name}}", {
                            name: provider.name,
                          })}
                        >
                          <IconTrash size={18} aria-hidden />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
