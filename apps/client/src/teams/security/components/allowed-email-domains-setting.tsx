import { useEffect, useState } from "react";
import { Alert, Button, Group, TagsInput } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useUpdateWorkspaceSetting } from "@/teams/shared/hooks/use-update-workspace-setting";
import { SettingRow } from "./setting-row";

// The server keeps only the part of each entry that matches a lower-case
// domain pattern, so "Example.com" would be stored as "xample.com".
// Lower-casing and dropping a leading "@" first avoids that.
export function normalizeDomainEntries(entries: string[]): string[] {
  const result: string[] = [];
  for (const entry of entries) {
    const value = entry.trim().toLowerCase().replace(/^@+/, "");
    if (value && !result.includes(value)) {
      result.push(value);
    }
  }
  return result;
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function AllowedEmailDomainsSetting() {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const updateSetting = useUpdateWorkspaceSetting();
  const savedDomains = workspace?.emailDomains ?? [];
  const savedKey = savedDomains.join("\n");

  const [domains, setDomains] = useState<string[]>(savedDomains);
  const [rejected, setRejected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Follow changes made elsewhere, for example by a refetch.
  useEffect(() => {
    setDomains(savedDomains);
  }, [savedKey]);

  const pending = normalizeDomainEntries(domains);
  const changed = !sameList(pending, savedDomains);

  const handleSave = async () => {
    setSaving(true);
    const updated = await updateSetting({ emailDomains: pending });
    setSaving(false);
    if (!updated) return;

    const stored = updated.emailDomains ?? [];
    setDomains(stored);
    setRejected(pending.filter((domain) => !stored.includes(domain)));
    notifications.show({ message: t("Allowed email domains saved") });
  };

  return (
    <SettingRow
      title={t("Allowed email domains")}
      description={t(
        "When this list has entries, sign-ups, SSO sign-ins and invitations must use an email address from one of these domains. Leave it empty to accept any domain.",
      )}
    >
      <TagsInput
        mt="sm"
        aria-label={t("Allowed email domains")}
        placeholder={domains.length === 0 ? t("e.g. example.com") : undefined}
        value={domains}
        onChange={(value) => {
          setDomains(value);
          setRejected([]);
        }}
        splitChars={[",", " ", ";"]}
        clearable
        acceptValueOnBlur
      />

      {rejected.length > 0 && (
        <Alert
          mt="sm"
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle aria-hidden />}
        >
          {t(
            "These entries are not valid domains and were not saved: {{domains}}",
            {
              domains: rejected.join(", "),
            },
          )}
        </Alert>
      )}

      <Group justify="flex-end" mt="sm">
        <Button onClick={handleSave} disabled={!changed} loading={saving}>
          {t("Save")}
        </Button>
      </Group>
    </SettingRow>
  );
}
