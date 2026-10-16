import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  getDefaultZIndex,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconPlugConnected } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getApiErrorMessage } from "@/lib/api-error.ts";
import { ISsoProvider, SsoPreset, SsoTestResult } from "../sso.types";
import { getPresetLabel } from "../sso-presets";
import {
  ProviderFormValues,
  buildCreatePayload,
  buildTestPayload,
  buildUpdatePayload,
  draftFormValues,
  getProviderPreset,
  hasUnsavedChanges,
  savedFormValues,
  validateProviderForm,
} from "../provider-form";
import { wouldLockOut } from "../lockout";
import { buildSsoCallbackUrl } from "../sso-urls";
import {
  useCreateSsoProviderMutation,
  useTestSsoProviderMutation,
  useUpdateSsoProviderMutation,
} from "../queries/sso-provider-query";
import { SsoProviderFields } from "./sso-provider-fields";
import { SsoProviderIcon } from "./sso-provider-icon";
import { SsoTestResultView } from "./sso-test-result";

// A draft exists only in this editor until it is saved; its id is generated
// up front so the callback URL can be registered before saving.
export type SsoEditorTarget =
  | { kind: "draft"; id: string; preset: SsoPreset }
  | { kind: "saved"; provider: ISsoProvider };

type SsoProviderEditorProps = {
  target: SsoEditorTarget;
  providers: ISsoProvider[];
  onClose: () => void;
};

export function SsoProviderEditor({
  target,
  providers,
  onClose,
}: SsoProviderEditorProps) {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const isDraft = target.kind === "draft";
  const preset = isDraft ? target.preset : getProviderPreset(target.provider);
  const providerId = isDraft ? target.id : target.provider.id;

  // Fixed for the life of the editor; the parent remounts it per target.
  const initialValues = useMemo<ProviderFormValues>(
    () =>
      target.kind === "draft"
        ? draftFormValues(target.preset)
        : savedFormValues(target.provider),
    [],
  );

  const hasStoredSecret =
    target.kind === "saved" && target.provider.hasOidcClientSecret === true;
  const form = useForm<ProviderFormValues>({
    initialValues,
    validate: (values) =>
      validateProviderForm(
        preset,
        values,
        t,
        isDraft ? undefined : { initialValues, hasStoredSecret },
      ),
  });

  const createMutation = useCreateSsoProviderMutation();
  const updateMutation = useUpdateSsoProviderMutation();
  const testMutation = useTestSsoProviderMutation();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<SsoTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const enforceSso = workspace?.enforceSso === true;
  const keepEnabled =
    !isDraft && wouldLockOut(enforceSso, providers, providerId);
  const saving = createMutation.isPending || updateMutation.isPending;
  const dirty = hasUnsavedChanges(preset, initialValues, form.values);
  const presetLabel = getPresetLabel(preset, t);

  // Cancel, the close button, Esc and a click outside all end up here.
  const requestClose = () => {
    if (saving) return;
    if (dirty) {
      setConfirmingDiscard(true);
    } else {
      onClose();
    }
  };

  const handleSubmit = async (values: ProviderFormValues) => {
    setSaveError(null);

    if (
      !isDraft &&
      !values.isEnabled &&
      wouldLockOut(enforceSso, providers, providerId)
    ) {
      setSaveError(
        t(
          "Enforce SSO is on and this is the only enabled provider. Turn off Enforce SSO before disabling it.",
        ),
      );
      return;
    }

    try {
      if (isDraft) {
        await createMutation.mutateAsync(
          buildCreatePayload(providerId, preset, values),
        );
      } else {
        await updateMutation.mutateAsync(
          buildUpdatePayload(providerId, preset, initialValues, values),
        );
      }
      notifications.show({
        message: isDraft ? t("SSO provider added") : t("SSO provider saved"),
      });
      onClose();
    } catch (err) {
      setSaveError(getApiErrorMessage(err, t("Could not save the provider")));
    }
  };

  const handleTest = async () => {
    const validation = await form.validate();
    if (validation.hasErrors) return;

    setTestError(null);
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync(
        buildTestPayload(
          isDraft ? { preset } : { providerId },
          preset,
          form.getValues(),
        ),
      );
      setTestResult(result);
    } catch (err) {
      setTestError(getApiErrorMessage(err, t("Could not run the test")));
    }
  };

  const title = (
    <Group gap="xs" wrap="nowrap">
      <SsoProviderIcon preset={preset} size={20} />
      <Text fw={500}>
        {isDraft
          ? t("Add {{preset}} provider", { preset: presetLabel })
          : t("Edit SSO provider")}
      </Text>
    </Group>
  );

  return (
    <>
      <Modal
        opened
        onClose={requestClose}
        title={title}
        size="lg"
        closeOnEscape={!confirmingDiscard}
        trapFocus={!confirmingDiscard}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
          <Stack gap="lg">
            <SsoProviderFields
              form={form}
              preset={preset}
              callbackUrl={buildSsoCallbackUrl(providerId)}
              hasStoredSecret={hasStoredSecret}
              keepEnabled={keepEnabled}
            />

            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Text size="sm" c="dimmed">
                  {t(
                    "Check the values above against the provider without saving them.",
                  )}
                </Text>
                <Button
                  type="button"
                  variant="default"
                  leftSection={<IconPlugConnected size={16} aria-hidden />}
                  onClick={handleTest}
                  loading={testMutation.isPending}
                  style={{ flexShrink: 0 }}
                >
                  {t("Test connection")}
                </Button>
              </Group>
              {testError && (
                <Alert
                  variant="light"
                  color="red"
                  icon={<IconAlertCircle aria-hidden />}
                >
                  {testError}
                </Alert>
              )}
              {testResult && <SsoTestResultView result={testResult} />}
            </Stack>

            {saveError && (
              <Alert
                variant="light"
                color="red"
                title={t("The provider was not saved")}
                icon={<IconAlertCircle aria-hidden />}
              >
                {saveError}
              </Alert>
            )}

            <Group justify="flex-end" gap="sm">
              <Button type="button" variant="default" onClick={requestClose}>
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                loading={saving}
                disabled={!isDraft && !dirty}
              >
                {isDraft ? t("Add provider") : t("Save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={confirmingDiscard}
        onClose={() => setConfirmingDiscard(false)}
        title={t("Discard unsaved changes?")}
        centered
        size="sm"
        zIndex={getDefaultZIndex("modal") + 10}
        closeButtonProps={{ "aria-label": t("Close") }}
      >
        <Text size="sm">
          {isDraft
            ? t(
                "This provider has not been added yet. Its settings will be lost.",
              )
            : t("Your changes to this provider will be lost.")}
        </Text>
        <Group justify="flex-end" gap="sm" mt="lg">
          <Button
            variant="default"
            onClick={() => setConfirmingDiscard(false)}
            data-autofocus
          >
            {t("Keep editing")}
          </Button>
          <Button
            color="red"
            onClick={() => {
              setConfirmingDiscard(false);
              onClose();
            }}
          >
            {t("Discard changes")}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
