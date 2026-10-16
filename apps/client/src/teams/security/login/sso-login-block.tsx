import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Divider, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import useCurrentUser from "@/features/user/hooks/use-current-user.ts";
import { getRedirectParam } from "@/lib/app-route.ts";
import { IAuthProvider, SSO_PROVIDER_TYPE } from "../sso/sso.types";
import { buildSsoLoginUrl } from "../sso/sso-urls";
import { SsoProviderIcon } from "../sso/components/sso-provider-icon";
import { getSsoLoginErrorMessage } from "./sso-login-errors";
import {
  readLastAutoRedirect,
  rememberAutoRedirect,
  shouldAutoRedirect,
} from "./sso-auto-redirect";

// This server can only sign people in through OIDC-type providers. SAML,
// LDAP or Google rows can be left over from an upstream enterprise install.
export function getLoginProviders(
  providers: IAuthProvider[] | null | undefined,
): IAuthProvider[] {
  return (providers ?? []).filter(
    (provider) => provider?.type === SSO_PROVIDER_TYPE,
  );
}

// SSO buttons above the password form on the login and invitation pages.
export default function SsoLoginBlock() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const { data: workspace } = useWorkspacePublicDataQuery();
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const [redirectingTo, setRedirectingTo] = useState<IAuthProvider | null>(
    null,
  );

  const providers = useMemo(
    () => getLoginProviders(workspace?.authProviders),
    [workspace?.authProviders],
  );
  const enforceSso = workspace?.enforceSso === true;
  const signedIn = Boolean(currentUser?.user);
  const redirectPath = getRedirectParam();
  const errorCode = new URLSearchParams(search).get("sso_error");
  const errorMessage =
    errorCode !== null ? getSsoLoginErrorMessage(errorCode, t) : null;

  useEffect(() => {
    if (!workspace || isUserLoading || redirectingTo) return;

    const now = Date.now();
    const redirect = shouldAutoRedirect({
      enforceSso,
      providerCount: providers.length,
      signedIn,
      pathname,
      search,
      lastRedirectAt: readLastAutoRedirect(),
      now,
    });
    if (!redirect) return;

    const [provider] = providers;
    rememberAutoRedirect(now);
    setRedirectingTo(provider);
    window.location.assign(buildSsoLoginUrl(provider.id, redirectPath));
  }, [workspace, isUserLoading, signedIn, pathname, search]);

  if (!workspace && !errorMessage) return null;

  const noProviderAvailable = enforceSso && providers.length === 0;
  if (!errorMessage && providers.length === 0 && !noProviderAvailable) {
    return null;
  }

  return (
    <Stack gap="sm" mb="md">
      {errorMessage && (
        <Alert
          variant="light"
          color="red"
          title={t("Single sign-on failed")}
          icon={<IconAlertCircle aria-hidden />}
        >
          {errorMessage}
        </Alert>
      )}

      {noProviderAvailable && (
        <Alert
          variant="light"
          color="gray"
          icon={<IconInfoCircle aria-hidden />}
        >
          {t(
            "No sign-in option is available for this workspace right now. Contact a workspace admin.",
          )}
        </Alert>
      )}

      {providers.map((provider) => (
        <Button
          key={provider.id}
          component="a"
          href={buildSsoLoginUrl(provider.id, redirectPath)}
          variant="default"
          fullWidth
          leftSection={<SsoProviderIcon preset={provider.preset} />}
        >
          {provider.name}
        </Button>
      ))}

      {redirectingTo && (
        <Text size="sm" c="dimmed" ta="center" role="status">
          {t("Redirecting to {{name}}…", { name: redirectingTo.name })}
        </Text>
      )}

      {providers.length > 0 && !enforceSso && (
        <Divider label={t("or")} labelPosition="center" mt="xs" />
      )}
    </Stack>
  );
}
