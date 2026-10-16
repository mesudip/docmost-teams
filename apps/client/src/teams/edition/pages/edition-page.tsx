import {
  Alert,
  Anchor,
  Badge,
  Group,
  List,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconCheck, IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { TEAMS_TIER } from "@/teams/entitlement/entitlement.types";

export const TEAMS_README_URL =
  "https://github.com/mesudip/docmost-teams#readme";

function getClientVersion(): string {
  return typeof APP_VERSION === "string" ? APP_VERSION : "";
}

// Settings → License & Edition on self-hosted installs.
export default function EditionPage() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  if (!isAdmin) {
    return <Navigate to="/settings/account/profile" replace />;
  }

  const version = getClientVersion();
  const additions = [
    t(
      "Single sign-on through OpenID Connect, with presets for Keycloak, Google, Microsoft Entra ID, Facebook and any other OIDC provider",
    ),
    t("Enforced SSO for the whole workspace"),
    t("Group and role sync from your identity provider"),
    t("Private spaces that only their creator can open"),
    t(
      "Workspace security settings: allowed email domains, public sharing and trash retention",
    ),
  ];

  return (
    <>
      <DocumentTitle title={t("License & Edition")} />
      <SettingsTitle title={t("License & Edition")} />

      <Stack gap="lg">
        <div>
          <Group gap="sm" align="center">
            <Title order={2} size="h4">
              {TEAMS_TIER}
            </Title>
            {version && (
              <Badge variant="light" color="gray" radius="sm">
                v{version}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed" mt={4}>
            {t(
              "A self-hosted build of open-source Docmost with extra features for teams.",
            )}
          </Text>
        </div>

        <div>
          <Text fw={500} mb="xs">
            {t("What this edition adds")}
          </Text>
          <List
            spacing="xs"
            size="sm"
            icon={
              <ThemeIcon color="teal" variant="light" size={20} radius="xl">
                <IconCheck size={14} aria-hidden />
              </ThemeIcon>
            }
          >
            {additions.map((item) => (
              <List.Item key={item}>{item}</List.Item>
            ))}
          </List>
        </div>

        <Alert
          variant="light"
          color="gray"
          icon={<IconInfoCircle aria-hidden />}
        >
          {t(
            "Docmost Enterprise features are not part of this edition. Nothing here needs a license key.",
          )}
        </Alert>

        <Text size="sm">
          <Anchor
            href={TEAMS_README_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Read the docmost-teams README")}
          </Anchor>
        </Text>
      </Stack>
    </>
  );
}
