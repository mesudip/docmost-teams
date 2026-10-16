import { Alert, List, Stack, Table, Text } from "@mantine/core";
import { IconCircleCheck, IconCircleX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SsoTestResult } from "../sso.types";

type SsoTestResultViewProps = {
  result: SsoTestResult;
};

// Everything the server returns is shown as plain text, never as markup or
// links.
export function SsoTestResultView({ result }: SsoTestResultViewProps) {
  const { t } = useTranslation();

  const credentials =
    result.credentials === "valid"
      ? t("The provider accepted the client ID and secret.")
      : result.credentials === "invalid"
        ? t("The provider rejected the client ID or secret.")
        : t("The client ID and secret could not be checked.");

  const details: [string, string | null | undefined][] = [
    [t("Issuer"), result.issuer],
    [t("Authorization endpoint"), result.authorizationEndpoint],
    [t("Token endpoint"), result.tokenEndpoint],
    [t("Userinfo endpoint"), result.userinfoEndpoint],
    [t("Token authentication"), result.tokenAuthMethod],
  ];
  const shownDetails = details.filter(([, value]) => Boolean(value));
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];

  return (
    <Alert
      variant="light"
      color={result.ok ? "teal" : "red"}
      title={result.ok ? t("Test passed") : t("Test failed")}
      icon={
        result.ok ? (
          <IconCircleCheck aria-hidden />
        ) : (
          <IconCircleX aria-hidden />
        )
      }
      role="status"
    >
      <Stack gap="xs">
        <Text size="sm">{String(result.message ?? "")}</Text>
        <Text size="sm">{credentials}</Text>

        {shownDetails.length > 0 && (
          <Table withRowBorders={false} verticalSpacing={2} fz="xs">
            <Table.Tbody>
              {shownDetails.map(([label, value]) => (
                <Table.Tr key={label}>
                  <Table.Th fw={500} w={170} style={{ verticalAlign: "top" }}>
                    {label}
                  </Table.Th>
                  <Table.Td style={{ wordBreak: "break-all" }}>
                    {String(value)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {warnings.length > 0 && (
          <div>
            <Text size="sm" fw={500}>
              {t("Warnings")}
            </Text>
            <List size="sm" spacing={2}>
              {warnings.map((warning, index) => (
                <List.Item key={index}>{String(warning)}</List.Item>
              ))}
            </List>
          </div>
        )}
      </Stack>
    </Alert>
  );
}
