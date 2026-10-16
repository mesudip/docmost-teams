import React from "react";
import {
  Alert,
  Divider,
  PasswordInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
} from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import CopyTextButton from "@/components/common/copy.tsx";
import { SsoPreset } from "../sso.types";
import {
  SSO_PRESET_INFO,
  deriveKeycloakIssuer,
  getPresetLabel,
  presetSupportsGroups,
} from "../sso-presets";
import { ProviderFormValues, usesInsecureHttp } from "../provider-form";

type SsoProviderFieldsProps = {
  form: UseFormReturnType<ProviderFormValues>;
  preset: SsoPreset;
  callbackUrl: string;
  hasStoredSecret: boolean;
  // Disabling would lock everyone out while Enforce SSO is on.
  keepEnabled: boolean;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Divider
      labelPosition="left"
      label={
        <Text size="sm" fw={600} c="var(--mantine-color-text)">
          {children}
        </Text>
      }
    />
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <Alert
      variant="light"
      color="yellow"
      icon={<IconAlertTriangle aria-hidden />}
      p="xs"
    >
      <Text size="sm">{children}</Text>
    </Alert>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Alert
      variant="light"
      color="blue"
      icon={<IconInfoCircle aria-hidden />}
      p="xs"
    >
      <Text size="sm">{children}</Text>
    </Alert>
  );
}

export function SsoProviderFields({
  form,
  preset,
  callbackUrl,
  hasStoredSecret,
  keepEnabled,
}: SsoProviderFieldsProps) {
  const { t } = useTranslation();
  const values = form.values;
  const info = SSO_PRESET_INFO[preset];
  const isFacebook = preset === "facebook";
  const supportsGroups = presetSupportsGroups(preset);
  const presetLabel = getPresetLabel(preset, t);

  const promptOptions = [
    { value: "none", label: t("None: the provider decides") },
    { value: "login", label: t("login: always ask for credentials") },
    {
      value: "select_account",
      label: t("select_account: let people choose an account"),
    },
    { value: "consent", label: t("consent: always ask for consent") },
  ];
  const tokenAuthOptions = [
    { value: "auto", label: t("Automatic") },
    { value: "client_secret_post", label: "client_secret_post" },
    { value: "client_secret_basic", label: "client_secret_basic" },
  ];

  const keycloakIssuer =
    preset === "keycloak"
      ? deriveKeycloakIssuer(values.keycloakUrl, values.keycloakRealm)
      : null;

  const openSignup =
    values.allowSignup &&
    ((preset === "google" && !values.googleHostedDomain.trim()) || isFacebook);
  const assignsRoles =
    supportsGroups &&
    values.groupSync &&
    (values.ownerGroups.some((group) => group.trim()) ||
      values.adminGroups.some((group) => group.trim()));

  return (
    <Stack gap="md">
      <SectionTitle>{t("General")}</SectionTitle>

      <TextInput
        withAsterisk
        label={t("Display name")}
        description={t("Shown on the sign-in button.")}
        data-autofocus
        {...form.getInputProps("name")}
      />

      <TextInput
        readOnly
        label={t("Callback URL")}
        description={t(
          "Register this redirect URI with your identity provider.",
        )}
        value={callbackUrl}
        rightSection={
          <CopyTextButton text={callbackUrl} label={t("Copy callback URL")} />
        }
        styles={{
          input: { fontFamily: "var(--mantine-font-family-monospace)" },
        }}
      />

      <SectionTitle>{t("Connection")}</SectionTitle>

      {preset === "generic" && (
        <TextInput
          label={t("Issuer URL")}
          description={t(
            "The provider's OpenID Connect issuer. Docmost loads its configuration from the issuer's discovery document.",
          )}
          placeholder="https://idp.example.com"
          {...form.getInputProps("oidcIssuer")}
        />
      )}

      {preset === "keycloak" && (
        <>
          <TextInput
            label={t("Keycloak server URL")}
            placeholder="https://keycloak.example.com"
            {...form.getInputProps("keycloakUrl")}
          />
          <TextInput
            label={t("Realm")}
            placeholder="docmost"
            {...form.getInputProps("keycloakRealm")}
          />
          <TextInput
            readOnly
            label={t("Issuer URL")}
            description={t("Derived from the server URL and realm.")}
            value={keycloakIssuer ?? ""}
            placeholder={t("Fill in the server URL and realm")}
          />
        </>
      )}

      {preset === "microsoft" && (
        <TextInput
          label={t("Directory (tenant) ID")}
          description={t(
            "Only accounts from this Microsoft Entra tenant can sign in.",
          )}
          placeholder="00000000-0000-0000-0000-000000000000"
          {...form.getInputProps("microsoftTenantId")}
        />
      )}

      {preset === "google" && (
        <TextInput
          label={t("Google Workspace domain")}
          description={t(
            "Optional. When set, only accounts managed by this Google Workspace domain can sign in.",
          )}
          placeholder="example.com"
          {...form.getInputProps("googleHostedDomain")}
        />
      )}

      {isFacebook && (
        <TextInput
          label={t("Graph API version")}
          description={t("Optional. Leave empty to use {{version}}.", {
            version: info.defaults.facebookGraphVersion,
          })}
          placeholder={info.defaults.facebookGraphVersion}
          {...form.getInputProps("facebookGraphVersion")}
        />
      )}

      {usesInsecureHttp(preset, values) && (
        <Warning>
          {t(
            "This address uses http, so tokens travel unencrypted. Use http only for local development.",
          )}
        </Warning>
      )}

      <TextInput
        label={isFacebook ? t("App ID") : t("Client ID")}
        autoComplete="off"
        {...form.getInputProps("oidcClientId")}
      />

      <PasswordInput
        label={isFacebook ? t("App secret") : t("Client secret")}
        description={
          hasStoredSecret
            ? t("A secret is stored. Leave this empty to keep it.")
            : t("No secret is stored yet.")
        }
        placeholder={hasStoredSecret ? t("Stored secret unchanged") : undefined}
        autoComplete="new-password"
        visibilityToggleButtonProps={{
          "aria-label": t("Toggle secret visibility"),
        }}
        {...form.getInputProps("oidcClientSecret")}
      />

      <SectionTitle>{t("Sign-in")}</SectionTitle>

      <Switch
        label={t("Enabled")}
        description={
          keepEnabled
            ? t(
                "Enforce SSO is on and this is the only enabled provider. Turn off Enforce SSO before disabling it.",
              )
            : t(
                "Show this provider on the sign-in page. The required settings must be filled in first.",
              )
        }
        disabled={keepEnabled && values.isEnabled}
        {...form.getInputProps("isEnabled", { type: "checkbox" })}
      />

      <Switch
        label={t("Allow sign-up")}
        description={t(
          "Create an account the first time someone signs in with this provider. When off, only people who already have an account can sign in.",
        )}
        {...form.getInputProps("allowSignup", { type: "checkbox" })}
      />

      {openSignup && (
        <Warning>
          {t(
            "Anyone with a {{provider}} account can create an account in this workspace, unless the allowed email domains in Security & SSO restrict it.",
            { provider: presetLabel },
          )}
        </Warning>
      )}

      {supportsGroups && (
        <>
          <SectionTitle>{t("Group and role sync")}</SectionTitle>

          <Switch
            label={t("Sync groups and roles")}
            description={t(
              "At every sign-in, add people to the Docmost groups named after their identity-provider groups.",
            )}
            {...form.getInputProps("groupSync", { type: "checkbox" })}
          />

          {preset === "microsoft" && values.groupSync && (
            <Note>
              {t(
                "Microsoft Entra ID leaves groups out of the token for people in more than 200 groups. Group and role sync is skipped for them.",
              )}
            </Note>
          )}

          {values.groupSync && (
            <>
              <TextInput
                label={t("Group claim")}
                description={t(
                  "The claim that lists a person's groups. Use dots for nested claims, for example realm_access.roles.",
                )}
                placeholder={info.defaults.groupClaimName}
                {...form.getInputProps("groupClaimName")}
              />
              <TagsInput
                label={t("Groups to sync")}
                description={t(
                  "Patterns of group names to sync, where * matches any text. Leave empty to sync every group.",
                )}
                placeholder={t("Add a pattern and press Enter")}
                clearable
                {...form.getInputProps("groupFilter")}
              />
              <TagsInput
                label={t("Owner groups")}
                description={t(
                  "Members of these groups become workspace owners.",
                )}
                placeholder={t("Add a group and press Enter")}
                clearable
                {...form.getInputProps("ownerGroups")}
              />
              <TagsInput
                label={t("Admin groups")}
                description={t(
                  "Members of these groups become workspace admins.",
                )}
                placeholder={t("Add a group and press Enter")}
                clearable
                {...form.getInputProps("adminGroups")}
              />
              {assignsRoles && (
                <Warning>
                  {t(
                    "Members of these identity-provider groups get the matching workspace role at every sign-in. Owners administer every space except private spaces.",
                  )}
                </Warning>
              )}
            </>
          )}
        </>
      )}

      <SectionTitle>{t("Advanced")}</SectionTitle>

      <TextInput
        label={t("Scopes")}
        description={
          info.protocol === "oidc"
            ? t("Separate scopes with spaces. openid is always added.")
            : t("Separate scopes with spaces.")
        }
        placeholder={info.defaults.scopes}
        {...form.getInputProps("scopes")}
      />

      <Select
        label={t("Login prompt")}
        description={t("Asks the provider to show a particular sign-in step.")}
        data={promptOptions}
        allowDeselect={false}
        {...form.getInputProps("prompt")}
      />

      {!isFacebook && (
        <Select
          label={t("Token endpoint authentication")}
          description={t(
            "How Docmost sends the client secret. Automatic picks a method the provider supports.",
          )}
          data={tokenAuthOptions}
          allowDeselect={false}
          {...form.getInputProps("tokenAuthMethod")}
        />
      )}

      <Switch
        label={t("Require a verified email")}
        description={
          isFacebook
            ? t(
                "Facebook never says whether an email address is verified, so turning this on blocks every sign-in.",
              )
            : t(
                "Reject sign-ins unless the provider confirms the email address is verified.",
              )
        }
        disabled={isFacebook && !values.requireVerifiedEmail}
        {...form.getInputProps("requireVerifiedEmail", { type: "checkbox" })}
      />

      {!values.requireVerifiedEmail && (
        <Warning>
          {t(
            "Without this check, signing in attaches to any existing account with the same email address. Leave it off only for providers that control their users' addresses.",
          )}
        </Warning>
      )}
    </Stack>
  );
}
