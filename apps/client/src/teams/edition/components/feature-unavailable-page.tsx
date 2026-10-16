import {
  Button,
  Container,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconPuzzleOff } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import APP_ROUTE from "@/lib/app-route.ts";

// Shared page for routes of features this edition does not include.
export function FeatureUnavailablePage() {
  const { t } = useTranslation();

  return (
    <>
      <DocumentTitle title={t("Not available")} />
      <Container size="xs" py={80}>
        <Stack align="center" gap="md">
          <ThemeIcon variant="light" color="gray" size={56} radius="xl">
            <IconPuzzleOff size={28} stroke={1.5} aria-hidden />
          </ThemeIcon>
          <Title order={1} size="h3" ta="center">
            {t("Not available in docmost-teams")}
          </Title>
          <Text c="dimmed" ta="center">
            {t(
              "This feature is not part of docmost-teams, so there is nothing to show here.",
            )}
          </Text>
          <Button component={Link} to={APP_ROUTE.HOME} variant="light">
            {t("Go to home")}
          </Button>
        </Stack>
      </Container>
    </>
  );
}

export default FeatureUnavailablePage;
