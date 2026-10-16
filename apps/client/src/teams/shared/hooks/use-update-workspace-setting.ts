import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IWorkspace } from "@/features/workspace/types/workspace.types.ts";
import { getApiErrorMessage } from "@/lib/api-error.ts";

// Saves workspace settings the way core settings components do: POST
// /workspace/update, then store the returned workspace in the atom.
// Resolves with the updated workspace, or null after showing the error.
export function useUpdateWorkspaceSetting() {
  const { t } = useTranslation();
  const setWorkspace = useSetAtom(workspaceAtom);

  return useCallback(
    async (data: Partial<IWorkspace>): Promise<IWorkspace | null> => {
      try {
        const updated = await updateWorkspace(data);
        setWorkspace(updated);
        return updated;
      } catch (err) {
        notifications.show({
          color: "red",
          message: getApiErrorMessage(err, t("Could not save the setting")),
        });
        return null;
      }
    },
    [setWorkspace, t],
  );
}
