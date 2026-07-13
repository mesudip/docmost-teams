import React, { useState } from "react";
import { useDisclosure } from "@mantine/hooks";
import { Button, Group } from "@mantine/core";
import { useCreateSsoProviderMutation } from "@/ee/security/queries/security-query.ts";
import { SSO_PROVIDER } from "@/ee/security/contants.ts";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import SsoProviderModal from "@/ee/security/components/sso-provider-modal.tsx";
import { OpenIdIcon } from "@/components/icons/openid-icon.tsx";

export default function CreateSsoProvider() {
  const [opened, { open, close }] = useDisclosure(false);
  const [provider, setProvider] = useState<IAuthProvider | null>(null);

  const createSsoProviderMutation = useCreateSsoProviderMutation();

  const handleCreateOIDC = async () => {
    try {
      const newProvider = await createSsoProviderMutation.mutateAsync({
        type: SSO_PROVIDER.OIDC,
        name: "OIDC",
      });
      setProvider(newProvider);
      open();
    } catch (error) {
      console.error("Failed to create OIDC provider", error);
    }
  };

  return (
    <>
      <SsoProviderModal opened={opened} onClose={close} provider={provider} />

      <Group justify="flex-end">
        <Button leftSection={<OpenIdIcon size={16} />} onClick={handleCreateOIDC}>
          Create OIDC provider
        </Button>
      </Group>
    </>
  );
}
