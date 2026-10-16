import React from "react";
import { Alert, Divider, Group, Loader } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { entitlementAtom } from "@/teams/entitlement/entitlement-atom";
import { Feature } from "@/teams/entitlement/features";
import { hasFeature } from "@/teams/entitlement/hooks/use-has-feature";
import { useEntitlements } from "@/teams/entitlement/queries/entitlement-query";
import { useSsoProvidersQuery } from "../sso/queries/sso-provider-query";
import { SsoProvidersSection } from "../sso/components/sso-providers-section";
import { EnforceSsoSetting } from "../components/enforce-sso-setting";
import { AllowedEmailDomainsSetting } from "../components/allowed-email-domains-setting";
import { WorkspaceSharingSetting } from "../components/workspace-sharing-setting";
import { TrashRetentionSetting } from "../components/trash-retention-setting";

// Settings → Security & SSO. MFA, SCIM, API restrictions and templates are
// left out: this server doesn't support them.
export default function SecurityPage() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const workspace = useAtomValue(workspaceAtom);
  const entitlements = useAtomValue(entitlementAtom);
  const { isError: entitlementsFailed } = useEntitlements();
  const providersQuery = useSsoProvidersQuery(isAdmin);

  if (!isAdmin) {
    return <Navigate to="/settings/account/profile" replace />;
  }

  const header = (
    <>
      <DocumentTitle title={t("Security & SSO")} />
      <SettingsTitle title={t("Security & SSO")} />
    </>
  );

  if (!entitlements) {
    return (
      <>
        {header}
        {entitlementsFailed ? (
          <Alert
            variant="light"
            color="red"
            icon={<IconAlertCircle aria-hidden />}
          >
            {t(
              "Could not load the features of this server. Reload the page to try again.",
            )}
          </Alert>
        ) : (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        )}
      </>
    );
  }

  const providers = providersQuery.data?.items ?? [];
  const canManageSso = hasFeature(entitlements, Feature.SSO_CUSTOM);
  const canManageSecurity = hasFeature(entitlements, Feature.SECURITY_SETTINGS);
  // Keep the switch reachable if SSO is enforced, so it can be turned off.
  const showEnforceSso = canManageSso || workspace?.enforceSso === true;

  const sections: { key: string; node: React.ReactNode }[] = [];
  if (canManageSso) {
    sections.push({
      key: "providers",
      node: (
        <SsoProvidersSection
          providers={providers}
          isLoading={providersQuery.isLoading}
          error={providersQuery.error}
        />
      ),
    });
  }
  if (showEnforceSso) {
    sections.push({
      key: "enforce-sso",
      node: (
        <EnforceSsoSetting
          providers={providers}
          providersLoading={providersQuery.isLoading}
        />
      ),
    });
  }
  sections.push({ key: "email-domains", node: <AllowedEmailDomainsSetting /> });
  if (canManageSecurity) {
    sections.push({ key: "sharing", node: <WorkspaceSharingSetting /> });
    sections.push({ key: "trash", node: <TrashRetentionSetting /> });
  }

  return (
    <>
      {header}
      {sections.map((section, index) => (
        <React.Fragment key={section.key}>
          {index > 0 && <Divider my="lg" />}
          {section.node}
        </React.Fragment>
      ))}
    </>
  );
}
